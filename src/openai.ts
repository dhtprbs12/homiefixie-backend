import OpenAI from 'openai';
import fs from 'fs/promises';
import { AnalysisResult } from './types.js';
import { parseModelResponse, createFallbackResponse } from './validateModelOutput.js';
import dotenv from 'dotenv';
dotenv.config();

console.log('are you from here 1',process.env)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `You are a master craftsman with expertise across all home repair disciplines: carpentry, plumbing, electrical, roofing, flooring, masonry, painting, and HVAC. Analyze each repair issue with domain-specific knowledge.

IMPORTANT: Pay special attention to "Additional Details" section if provided - these contain specific answers to follow-up questions that help you give PRECISE recommendations instead of generic ones.

ANALYZE THE CONTEXT to determine repair type, then provide expert guidance:

ROOFING: Specify shingle types, flashing materials, weather considerations, safety equipment, seasonal timing
FLOORING: Detail subfloor requirements, adhesives/fasteners, acclimation periods, transition strips
ELECTRICAL: Emphasize safety, code compliance, circuit capacity, proper materials (THHN, Romex, etc.)
PLUMBING: Specify pipe materials (PEX, copper, PVC), fittings, pressure testing, water shut-off procedures
PAINTING: Detail surface prep, primer selection, paint types, drying conditions, coverage rates
MASONRY: Specify mortar types, curing conditions, expansion joints, moisture considerations
CARPENTRY: Detail wood species, fasteners, joinery methods, moisture content, structural considerations
HVAC: Specify duct materials, insulation R-values, airflow calculations, filter types

FOR EVERY REPAIR TYPE:
- MATERIALS: Exact product names, sizes, quantities, coverage areas, brands when relevant, PLUS a brief description of what each material does and why it's needed for this specific repair
  * Use Additional Details to choose PRECISE materials (e.g., if crack width is "Less than 1/4 inch" → flexible caulk, if "More than 1/2 inch" → mortar/concrete patch)
  * Consider location/exposure details (e.g., "water exposure: Yes" → waterproof materials, "exterior" → weather-resistant)
- TOOLS: Specific purpose for each tool in this exact repair, PLUS a description of how to use it properly and any technique tips
- STEPS: Detailed sequence with measurements, timing, quality checkpoints
  * Modify steps based on Additional Details (e.g., "old caulk: Lots of old, peeling caulk" → add removal steps)
- SAFETY: Hazards specific to this repair type and location
  * Adjust safety recommendations based on experience level and conditions from Additional Details
- LIKELIHOOD: Assess probable causes with confidence levels as decimals 0.0-1.0 (not percentages)

NEVER give generic advice. Always be specific to the exact problem, location, and materials involved. Use Additional Details to eliminate guesswork and provide PRECISE solutions.

Examples of specificity:
- "30-year architectural asphalt shingles, 33.3 sq ft per bundle" not "roofing material"
- "3/4" tongue-and-groove red oak flooring, 18-20 sq ft per carton" not "flooring"
- "12 AWG THHN copper wire rated for 20-amp circuits" not "electrical wire"

For youtube_url: This field is OPTIONAL and will be handled automatically by video search. You may omit this field entirely.

For youtube_search_term: This field is RECOMMENDED. Generate an optimized search term for finding relevant YouTube DIY tutorial videos.
- Should be concise (3-6 words maximum)
- Include "how to" or "DIY" for better YouTube results
- Focus on the main action (fix, repair, install, replace) and primary object/material
- Examples: "how to fix drywall hole", "DIY bathtub caulk replacement", "install ceiling fan tutorial"
- Be specific to the repair task, not generic

IMPORTANT: 
- Do NOT include youtube_url unless you are absolutely certain of a specific, real YouTube video URL
- Do NOT use placeholder URLs like "example_video", "placeholder", or made-up IDs
- Include youtube_search_term when possible - it helps find better relevant videos
- It's better to omit youtube_url entirely than to guess

Provide professional-level guidance that gives users confidence to proceed safely or know when expert help is required.

CRITICAL: You must respond with valid JSON only. The response will be parsed as JSON, so include no explanatory text, comments, or markdown formatting.`;

const JSON_SCHEMA = `{
  "type": "object",
  "required": ["materials", "tools", "steps"],
  "properties": {
    "materials": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string"},
          "spec": {"type": "string"},
          "qty": {"type": "string"},
          "description": {"type": "string"},
          "alt": {"type": "array", "items": {"type": "string"}},
          "image_url": {"type": "string"}
        }
      }
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string"},
          "purpose": {"type": "string"},
          "description": {"type": "string"},
          "image_url": {"type": "string"}
        }
      }
    },
    "steps": {"type": "array", "items": {"type": "string"}},
    "likelihood": {"type": "object", "additionalProperties": {"type": "number"}},
    "safety": {"type": "array", "items": {"type": "string"}},
    "youtube_url": {
      "type": "string",
      "description": "OPTIONAL: Only include if you know a real YouTube video URL. Do not use placeholders like 'example' or 'placeholder'. If unsure, omit this field entirely."
    },
    "youtube_search_term": {
      "type": "string",
      "description": "REQUIRED: Optimized search term for finding relevant YouTube DIY tutorial videos. Should be concise (3-6 words), include 'how to' or 'DIY', focus on the main action and object. Examples: 'how to fix drywall hole', 'DIY bathtub caulk replacement', 'install ceiling fan tutorial'"
    }
  }
}`;

function createUserPrompt(description: string): string {
  const context = extractDetailedContext(description);
  
  return `REPAIR ISSUE ANALYSIS:

Repair Type: ${context.repairType}
Location: ${context.location}
Problem Description: ${description}
Materials/Surface: ${context.materials}
Environment: ${context.environment}
System Type: ${context.systemType}

DOMAIN-SPECIFIC ANALYSIS REQUIRED:
${getDomainGuidance(context.repairType)}

DETAILED REQUIREMENTS:
1. ROOT CAUSE ANALYSIS: Identify underlying issues, not just visible symptoms
2. SPECIFIC MATERIALS: Exact product names, sizes, quantities, coverage areas, grade/quality specs, PLUS clear descriptions of what each material does and why it's essential for this repair
3. PRECISE TOOLS: Each tool's specific purpose and usage technique for this exact repair, PLUS descriptions of proper handling and any professional tips
4. STEP-BY-STEP PROCESS: Detailed sequence with measurements, timing, quality checkpoints
5. SAFETY CONSIDERATIONS: Hazards specific to this repair type and working environment
6. LIKELIHOOD ASSESSMENT: Probable causes with confidence levels as DECIMAL VALUES BETWEEN 0.0 and 1.0 (e.g., 0.8 = 80% likely, 0.3 = 30% likely)

Professional Standards Required:
- Building codes and permit requirements when applicable
- Material compatibility and performance ratings
- Environmental considerations (temperature, moisture, seasonal timing)
- Quality control checkpoints and success indicators
- Clear guidance on when professional help is required

RESPONSE FORMAT: Return ONLY valid JSON. No explanations, no markdown formatting, no code blocks. Just the raw JSON object.

JSON schema to follow exactly:
${JSON_SCHEMA}`;
}

function getDomainGuidance(repairType: string): string {
  const domainGuidance: Record<string, string> = {
    'roofing': 'Specify shingle types/weights, underlayment, flashing materials, fastener types, weather timing, safety equipment requirements.',
    'flooring': 'Detail subfloor requirements, acclimation periods, adhesive types, transition methods, expansion gaps, moisture barriers.',
    'electrical': 'Emphasize safety protocols, wire gauges, circuit capacity, code compliance, GFCI requirements, professional consultation needs.',
    'plumbing': 'Specify pipe materials (PEX/copper/PVC), fitting types, pressure ratings, shut-off procedures, code requirements, professional needs.',
    'hvac': 'Detail duct materials, insulation R-values, airflow calculations, filter specifications, efficiency ratings, permit requirements.',
    'painting/finishing': 'Specify primer types, paint formulations, surface prep requirements, environmental conditions, coverage rates, dry times.',
    'masonry': 'Detail mortar types, mixing ratios, curing conditions, expansion joints, waterproofing, structural considerations.',
    'carpentry': 'Specify wood species, moisture content, fastener types, joinery methods, structural requirements, finishing needs.',
    'general': 'Provide specific materials, tools, and procedures appropriate for this repair type.'
  };
  
  return domainGuidance[repairType] || domainGuidance['general'] || 'Provide specific materials, tools, and procedures appropriate for this repair type.';
}

function extractDetailedContext(description: string) {
  const text = description.toLowerCase();
  
  let location = 'indoor';
  let materials = 'mixed/unknown';
  let environment = 'standard';
  let repairType = 'general';
  let systemType = 'none';
  
  // Repair type detection (primary categorization)
  if (text.includes('roof') || text.includes('shingle') || text.includes('gutter') || text.includes('flashing') || text.includes('soffit') || text.includes('fascia')) {
    repairType = 'roofing';
    location = 'roof/exterior';
    environment = 'weather exposed/UV/temperature extremes';
  } else if (text.includes('floor') || text.includes('subfloor') || text.includes('hardwood') || text.includes('laminate') || text.includes('carpet') || text.includes('vinyl flooring')) {
    repairType = 'flooring';
    environment = 'foot traffic/moisture considerations';
  } else if (text.includes('wire') || text.includes('outlet') || text.includes('switch') || text.includes('breaker') || text.includes('electrical') || text.includes('circuit')) {
    repairType = 'electrical';
    environment = 'code compliance required/safety critical';
  } else if (text.includes('pipe') || text.includes('plumbing') || text.includes('faucet') || text.includes('toilet') || text.includes('drain') || text.includes('water')) {
    repairType = 'plumbing';
    environment = 'water pressure/code compliance';
  } else if (text.includes('furnace') || text.includes('hvac') || text.includes('ductwork') || text.includes('air conditioning') || text.includes('ventilation')) {
    repairType = 'hvac';
    environment = 'airflow/energy efficiency/code compliance';
  } else if (text.includes('paint') || text.includes('primer') || text.includes('wall') || text.includes('ceiling') || text.includes('surface')) {
    repairType = 'painting/finishing';
    environment = 'surface preparation critical';
  } else if (text.includes('concrete') || text.includes('brick') || text.includes('mortar') || text.includes('stone') || text.includes('masonry')) {
    repairType = 'masonry';
    environment = 'structural/weather exposure';
  } else if (text.includes('wood') || text.includes('lumber') || text.includes('beam') || text.includes('joist') || text.includes('trim') || text.includes('carpentry')) {
    repairType = 'carpentry';
    environment = 'structural/moisture content critical';
  }
  
  // Location-specific detection
  if (text.includes('attic')) {
    location = 'attic';
    environment = 'temperature extremes/insulation/ventilation';
  } else if (text.includes('basement') || text.includes('crawl space')) {
    location = 'basement/crawl space';
    environment = 'potential moisture/foundation/structural';
  } else if (text.includes('bathroom') || text.includes('shower')) {
    location = 'bathroom';
    environment = 'high humidity/water exposure/ventilation critical';
  } else if (text.includes('kitchen')) {
    location = 'kitchen';
    environment = 'moisture/grease/heat/code requirements';
  } else if (text.includes('garage')) {
    location = 'garage';
    environment = 'vehicle access/temperature variation';
  } else if (text.includes('exterior') || text.includes('outside') || text.includes('outdoor')) {
    location = 'exterior';
    environment = 'weather exposure/UV/freeze-thaw cycles';
  } else if (text.includes('pool') || text.includes('deck') || text.includes('patio')) {
    location = 'outdoor recreational area';
    environment = 'wet/chlorinated/UV exposure/safety critical';
  }
  
  // Material-specific detection
  if (text.includes('asphalt shingle') || text.includes('architectural shingle')) {
    materials = 'asphalt roofing materials';
  } else if (text.includes('hardwood') || text.includes('oak') || text.includes('maple')) {
    materials = 'solid hardwood flooring';
  } else if (text.includes('laminate')) {
    materials = 'laminate flooring systems';
  } else if (text.includes('pex') || text.includes('copper pipe')) {
    materials = 'modern plumbing materials';
  } else if (text.includes('romex') || text.includes('electrical wire')) {
    materials = 'residential electrical wiring';
  } else if (text.includes('drywall') || text.includes('sheetrock')) {
    materials = 'gypsum wallboard systems';
  } else if (text.includes('concrete') || text.includes('cement')) {
    materials = 'concrete/masonry materials';
  } else if (text.includes('lumber') || text.includes('wood')) {
    materials = 'structural lumber/wood products';
  }
  
  // System type detection
  if (text.includes('electrical panel') || text.includes('circuit breaker')) {
    systemType = 'electrical distribution';
  } else if (text.includes('water heater') || text.includes('hot water')) {
    systemType = 'water heating system';
  } else if (text.includes('furnace') || text.includes('heating system')) {
    systemType = 'heating system';
  } else if (text.includes('air conditioning') || text.includes('cooling')) {
    systemType = 'cooling system';
  }
  
  return { location, materials, environment, repairType, systemType };
}

export async function analyzeWithOpenAI(
  description: string,
  imagePath?: string
): Promise<AnalysisResult> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      }
    ];

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: createUserPrompt(description)
      }
    ];

    if (imagePath) {
      try {
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = getMimeType(imagePath);
        
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
            detail: 'high'
          }
        });
      } catch (imageError) {
        console.error('Failed to read image:', imageError);
        // Continue without image
      }
    }

    messages.push({
      role: 'user',
      content: userContent
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 2000, // Increased for more detailed responses
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    return parseModelResponse(content);
    
  } catch (error) {
    console.error('OpenAI analysis failed:', error);
    
    // Return fallback response
    return createFallbackResponse();
  }
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}