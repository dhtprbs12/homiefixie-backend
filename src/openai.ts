import OpenAI from 'openai';
import fs from 'fs/promises';
import { AnalysisResult } from './types.js';
import { parseModelResponse, createFallbackResponse } from './validateModelOutput.js';
import dotenv from 'dotenv';
if (process.env.NODE_ENV === 'production') {
  dotenv.config();
} else {
  dotenv.config({ path: '.env.local' }); // Loads .env for local development
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `You are a master craftsman with expertise across all home repair disciplines: carpentry, plumbing, electrical, roofing, flooring, masonry, painting, HVAC, appliances, windows/doors, insulation, exterior/landscaping, and interior finishing. Analyze each repair issue with domain-specific knowledge.

IMPORTANT: Pay special attention to "Additional Details" section if provided - these contain specific answers to follow-up questions that help you give PRECISE recommendations instead of generic ones.

ANALYZE THE CONTEXT to determine repair type, then provide expert guidance:

ROOFING: Include all roofing components (shingles, underlayment, flashing, gutters), materials, weather considerations, safety equipment, seasonal timing
FLOORING: Include flooring materials, subfloor requirements, adhesives/fasteners, underlayment, transition strips, acclimation periods
ELECTRICAL: Include all electrical components (outlets, switches, fixtures, panels), materials (THHN, Romex), safety, code compliance, circuit capacity
PLUMBING: Include all necessary components (fixtures, appliances, pipes, fittings), materials (PEX, copper, PVC), installation hardware, pressure testing, water shut-off procedures
PAINTING: Detail surface prep, primer selection, paint types, drying conditions, coverage rates
MASONRY: Specify mortar types, curing conditions, expansion joints, moisture considerations
CARPENTRY: Include lumber/materials, hardware, fasteners, joinery methods, moisture content, structural considerations
HVAC: Include all HVAC components (units, ducts, vents, filters), materials, insulation R-values, airflow calculations
APPLIANCES: Include appliance components, replacement parts, installation hardware, electrical/plumbing connections, warranty considerations
WINDOWS/DOORS: Include frames, glass, weatherstripping, hardware, locks, trim, insulation, security features
INSULATION: Include insulation materials (fiberglass, foam, cellulose), vapor barriers, air sealing, R-values, installation methods
EXTERIOR/LANDSCAPING: Include decking materials, concrete, pavers, fencing, drainage, outdoor fixtures, landscaping materials, landscape fabric, edging materials, fasteners (landscape staples, deck screws, anchor bolts)
INTERIOR FINISHING: Include drywall, trim, moldings, ceiling materials, built-in components, decorative elements

CRITICAL - REPLACEMENT SCENARIOS: When the task involves REPLACING a component, you MUST include ALL related parts typically needed:

TOILET REPLACEMENT → Include: toilet, toilet flange (closet flange), wax ring, toilet bolts, supply line, shut-off valve, toilet seat (if not included)
FAUCET REPLACEMENT → Include: faucet, supply lines, shut-off valves, plumber's putty/sealant, mounting hardware
DOOR REPLACEMENT → Include: door, hinges, door handle/knob, weatherstripping, door sweep, screws/fasteners, possibly door frame components  
WINDOW REPLACEMENT → Include: window unit, weatherstripping, caulk, shims, trim/casing, insulation, flashing (if exterior)
FLOORING REPLACEMENT → Include: flooring material, underlayment, transition strips, baseboards/quarter round, adhesive/fasteners
ELECTRICAL FIXTURE REPLACEMENT → Include: fixture, wire nuts, electrical box (if needed), circuit breaker (if upgrade), mounting hardware
APPLIANCE REPLACEMENT → Include: appliance, supply lines (water/gas), electrical connections, mounting/installation hardware, vent components (if applicable)
DECK BOARD REPLACEMENT → Include: deck boards, screws/fasteners, joist repair materials (if needed), stain/sealant
ROOF COMPONENT REPLACEMENT → Include: main component plus flashing, sealants, fasteners, underlayment (if applicable)
SIDING REPLACEMENT → Include: siding panels, house wrap/vapor barrier, fasteners, trim pieces, caulk/sealants, flashing
CABINET REPLACEMENT → Include: cabinets, hinges, handles/knobs, mounting screws, shims, possibly countertop support
WATER HEATER REPLACEMENT → Include: water heater, supply lines, gas line components (if gas), electrical connections, temperature/pressure relief valve, drain pan
GARBAGE DISPOSAL REPLACEMENT → Include: disposal unit, mounting assembly, electrical connections, discharge tube, mounting screws
CEILING FAN REPLACEMENT → Include: fan unit, electrical box (if upgrade needed), wire nuts, mounting hardware, possibly wall switch
FENCE REPLACEMENT → Include: fence panels/pickets, posts, post caps, hinges (for gates), fasteners, concrete (for posts), stain/sealant
GUTTER REPLACEMENT → Include: gutter sections, downspouts, brackets/hangers, end caps, connectors, sealants, fasteners
INSULATION REPLACEMENT → Include: insulation material, vapor barrier, air sealing materials, protective equipment, fasteners/staples
GARAGE DOOR REPLACEMENT → Include: door panels/unit, tracks, springs (torsion/extension), cables, brackets, rollers, weather stripping, opener (if motorized), remote controls, safety sensors

REMEMBER: "Replace" means the old component is removed and ALL connection/mounting points need attention!

COMPREHENSIVE REPAIR SCENARIOS: For repair tasks, include ALL materials needed to properly fix the issue:

LEAK REPAIRS → Include: sealants, patches, clamps, replacement gaskets/washers, pipe repair materials, cleanup materials
CRACK REPAIRS → Include: fillers (appropriate to material), mesh/tape (if needed), primers, paints/finishes, smoothing tools
CLOG REPAIRS → Include: drain cleaners, snakes/augers, plungers, replacement traps/pipes (if damaged), protective equipment
ELECTRICAL ISSUES → Include: replacement wires, wire nuts, electrical tape, circuit testers, possibly new breakers/outlets
SQUEAKY/STICKING → Include: lubricants, adjusters, replacement hinges/hardware, cleaning materials, alignment tools

INSTALLATION SCENARIOS: For new installations, include ALL components from start to finish:

NEW OUTLET/SWITCH → Include: device, electrical box, wire, conduit (if needed), wire nuts, cover plate, circuit protection
NEW LIGHT FIXTURE → Include: fixture, electrical box, mounting hardware, wire nuts, switch (if needed), bulbs
NEW FAUCET → Include: faucet, supply lines, shut-off valves, mounting hardware, sealants, possibly new drain assembly  
NEW APPLIANCE → Include: appliance, supply connections (water/gas/electric), mounting hardware, venting (if needed), permits/codes
NEW FLOORING → Include: flooring, underlayment, transitions, trim, fasteners, moisture barriers, tools rental
NEW DECK → Include: lumber, fasteners, post anchors, flashing, stain/sealant, railings, permits/inspections

MAINTENANCE SCENARIOS: For preventive maintenance, include ALL supplies for complete service:

HVAC MAINTENANCE → Include: filters, belts, lubricants, cleaning supplies, refrigerant (pro only), thermostat batteries
GUTTER CLEANING → Include: cleaning tools, sealants for repairs, hangers for loose sections, safety equipment
PRESSURE WASHING → Include: detergents, surface cleaners, protective coverings, possibly repair materials for damage found
WINTERIZATION → Include: insulation materials, weather stripping, pipe insulation, caulk, storm windows/doors
SPRING PREPARATION → Include: cleaning supplies, fertilizers, pest control, touch-up paints, equipment servicing materials

UPGRADE SCENARIOS: For improvement/modernization projects, include ALL components for complete upgrade:

BATHROOM UPGRADE → Include: new fixtures, vanity, mirror, lighting, ventilation, waterproofing, tiles, trim, permits
KITCHEN UPGRADE → Include: cabinets, countertops, backsplash, appliances, plumbing updates, electrical updates, lighting
ELECTRICAL UPGRADE → Include: new panel, circuits, outlets, switches, GFCI protection, surge protection, permits/inspection  
INSULATION UPGRADE → Include: insulation material, air sealing, vapor barriers, ventilation improvements, energy audit materials
SECURITY UPGRADE → Include: locks, cameras, sensors, lighting, timers, monitoring equipment, signage
ACCESSIBILITY UPGRADE → Include: grab bars, ramps, wider doors, lever handles, raised toilets, non-slip materials
ENERGY EFFICIENCY UPGRADE → Include: weatherstripping, caulk, storm windows/doors, programmable thermostats, LED lighting, insulation upgrades, duct sealing materials
OUTDOOR LIGHTING → Include: fixtures, LED bulbs, transformers (low voltage), wire, conduit, junction boxes, timers, photocells, mounting hardware, GFCI protection
STORAGE SOLUTIONS → Include: shelving units, brackets, anchors, bins, closet systems, garage organization, hooks, rails, mounting hardware

EMERGENCY/DAMAGE SCENARIOS: For urgent repairs, include immediate AND permanent solutions:

WATER DAMAGE → Include: water removal, dehumidifiers, fans, antimicrobial treatments, replacement materials, vapor barriers
STORM DAMAGE → Include: tarps/temporary covers, permanent repair materials, structural reinforcements, weatherproofing
POWER OUTAGE PREP → Include: generators, extension cords, surge protectors, flashlights, batteries, emergency supplies
FROZEN PIPES → Include: pipe insulation, heat cables, repair materials, shut-off tools, temporary heating
PEST INFESTATION → Include: traps, sealants, exclusion materials, cleaning supplies, professional consultation info
FOUNDATION REPAIRS → Include: hydraulic cement, epoxy injections, waterproof membranes, drainage materials, crack monitors, underpinning materials (professional)
OUTDOOR STRUCTURES → Include: lumber, fasteners, concrete footings, roofing materials, hardware, permits, weatherproofing, electrical (if needed)

LANDSCAPING/EXTERIOR SCENARIOS: For outdoor improvements, include ALL site work materials:

DRAINAGE ISSUES → Include: drain pipes, gravel, fabric, catch basins, grading tools, pipe connectors, drainage grates, possibly professional consultation
CONCRETE WORK → Include: concrete, forms, reinforcement (rebar, mesh), tools, sealers, expansion materials, curing compounds, anchor bolts, form release agents
GARDEN INSTALLATION → Include: soil amendments, plants, mulch, irrigation materials (drip lines, emitters, timers), tools, fertilizers, pest control, landscape fabric, edging stakes
FENCE INSTALLATION → Include: posts, panels, hardware (hinges, latches, brackets), concrete, tools, permits (if required), stain/preservation, post caps, gate hardware
DRIVEWAY REPAIR → Include: crack fillers, sealers, patches, cleaning materials, possibly professional equipment rental, expansion joint materials
ARTIFICIAL TURF → Include: turf material, landscape staples/turf nails (6"), base materials (sand, decomposed granite), seaming tape, infill material, edge restraints, compaction tools
SPRINKLER SYSTEM → Include: sprinkler heads, pipes (PVC/polyethylene), fittings, valves, timers/controllers, wire, valve boxes, backflow preventers, pressure regulators
POOL/SPA MAINTENANCE → Include: chemicals (chlorine, pH adjusters), filters, pumps, skimmers, cleaning equipment, test kits, heater components, covers, safety equipment
GARAGE DOOR REPAIR → Include: springs, cables, rollers, tracks, hinges, weather stripping, opener parts (belts, chains, gears), remote batteries, safety sensors

SPECIALTY SYSTEMS: For complex home systems, include ALL related components:

SMART HOME → Include: devices, wiring, network equipment, mounting hardware, apps/software setup, integration components
SOLAR INSTALLATION → Include: panels, inverters, mounting systems, electrical components, permits, professional consultation
WHOLE HOUSE GENERATOR → Include: generator, transfer switch, gas/electrical connections, permits, professional installation
WATER TREATMENT → Include: filters, softeners, UV systems, plumbing connections, maintenance supplies, water testing
HOME THEATER → Include: equipment, wiring, mounting, acoustic treatments, lighting controls, universal remotes
CHIMNEY/FIREPLACE → Include: flue liner, damper, chimney cap, spark arrestor, cleaning brushes, mortar, firebrick, glass doors, screens, gas logs (if applicable)
SEPTIC SYSTEM → Include: pumps, alarms, filters, risers, lids, baffles, distribution boxes, effluent filters, professional inspection/pumping services
WELL WATER SYSTEM → Include: well pump, pressure tank, pressure switch, check valves, pitless adapter, well cap, water treatment components, electrical connections
BASEMENT WATERPROOFING → Include: sealants, drainage systems, sump pumps, vapor barriers, insulation, dehumidifiers, foundation crack repair materials
ATTIC VENTILATION → Include: ridge vents, soffit vents, exhaust fans, intake vents, vent chutes, insulation baffles, thermostats, screening

FOR EVERY REPAIR TYPE:
- MATERIALS: Exact product names, sizes, quantities, coverage areas, brands when relevant, PLUS a brief description of what each material does and why it's needed for this specific repair
  * Use Additional Details to choose PRECISE materials (e.g., if crack width is "Less than 1/4 inch" → flexible caulk, if "More than 1/2 inch" → mortar/concrete patch)
  * Consider location/exposure details (e.g., "water exposure: Yes" → waterproof materials, "exterior" → weather-resistant)
  * For REPLACEMENTS: Always include the main component PLUS all associated installation/connection components
  * ALWAYS INCLUDE FASTENERS/HARDWARE: screws, nails, bolts, brackets, anchors, staples, clips, ties, adhesives - specify type, size, material, quantity
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