"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateModelOutput = validateModelOutput;
exports.parseModelResponse = parseModelResponse;
exports.createFallbackResponse = createFallbackResponse;
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default();
const materialSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        spec: { type: 'string', nullable: true },
        qty: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        alt: {
            type: 'array',
            items: { type: 'string' },
            nullable: true
        },
        image_url: { type: 'string', nullable: true },
        product_url: { type: 'string', nullable: true },
        store_name: { type: 'string', nullable: true }
    },
    required: ['name'],
    additionalProperties: false
};
const toolSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        purpose: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        image_url: { type: 'string', nullable: true },
        product_url: { type: 'string', nullable: true },
        store_name: { type: 'string', nullable: true }
    },
    required: ['name'],
    additionalProperties: false
};
const analysisSchema = {
    type: 'object',
    properties: {
        materials: {
            type: 'array',
            items: materialSchema
        },
        tools: {
            type: 'array',
            items: toolSchema
        },
        steps: {
            type: 'array',
            items: { type: 'string' }
        },
        likelihood: {
            type: 'object',
            nullable: true,
            required: [],
            additionalProperties: { type: 'number', minimum: 0, maximum: 1 }
        },
        safety: {
            type: 'array',
            items: { type: 'string' },
            nullable: true
        },
        youtube_url: { type: 'string', nullable: true },
        youtube_search_term: { type: 'string', nullable: true },
        youtube_videos: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    title: { type: 'string' },
                    channel: { type: 'string', nullable: true },
                    views: { type: 'string', nullable: true },
                    duration: { type: 'string', nullable: true }
                },
                required: ['url', 'title'],
                additionalProperties: false
            },
            nullable: true
        }
    },
    required: ['materials', 'tools', 'steps'],
    additionalProperties: false
};
const validate = ajv.compile(analysisSchema);
function validateModelOutput(data) {
    if (data && typeof data === 'object' && 'likelihood' in data) {
        const analysisData = data;
        if (analysisData.likelihood && typeof analysisData.likelihood === 'object') {
            for (const [key, value] of Object.entries(analysisData.likelihood)) {
                if (typeof value === 'number') {
                    if (value > 1) {
                        analysisData.likelihood[key] = value / 100;
                    }
                    else if (value < 0) {
                        analysisData.likelihood[key] = 0;
                    }
                    analysisData.likelihood[key] = Math.min(1, Math.max(0, analysisData.likelihood[key]));
                }
            }
        }
    }
    if (!validate(data)) {
        const errors = validate.errors?.map(err => `${err.instancePath || 'root'}: ${err.message}`).join(', ') || 'Unknown validation error';
        throw new Error(`Model output validation failed: ${errors}`);
    }
    return data;
}
function parseModelResponse(response) {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    if (!jsonStr.startsWith('{')) {
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }
        else {
            console.warn('No JSON found in OpenAI response:', response.substring(0, 200));
            throw new Error('OpenAI returned text instead of JSON - using fallback response');
        }
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    }
    catch (error) {
        console.warn('JSON parsing failed for response:', jsonStr.substring(0, 200));
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return validateModelOutput(parsed);
}
function createFallbackResponse() {
    return {
        materials: [
            {
                name: 'Assessment required',
                spec: 'Unable to determine specific materials without more information',
                qty: 'Varies by issue',
                description: 'More information needed to recommend specific materials for your repair',
                alt: ['Professional inspection recommended', 'Upload photo for better analysis']
            }
        ],
        tools: [
            {
                name: 'Assessment tools',
                purpose: 'Inspect and measure the problem area before selecting repair tools',
                description: 'Basic measuring and inspection tools to properly assess the repair requirements'
            }
        ],
        steps: [
            'Take clear photos of the issue from multiple angles',
            'Measure the affected area (length, width, depth of damage)',
            'Check for underlying causes (moisture, movement, structural issues)',
            'Research specific repair methods for your exact situation',
            'Gather appropriate materials based on your specific conditions',
            'Consider consulting a professional for complex or structural issues'
        ],
        likelihood: {
            'needs_more_information': 1.0
        },
        safety: [
            'Stop if you discover structural damage or safety hazards',
            'For electrical, plumbing, or gas issues, consult licensed professionals',
            'Use proper personal protective equipment',
            'Ensure work area is well-ventilated and stable',
            'Follow all local building codes and permit requirements'
        ]
    };
}
//# sourceMappingURL=validateModelOutput.js.map