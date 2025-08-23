import { validateModelOutput, parseModelResponse, createFallbackResponse } from '../src/validateModelOutput';
import { AnalysisResult } from '../src/types';

describe('validateModelOutput', () => {
  const validAnalysis: AnalysisResult = {
    materials: [
      {
        name: '100% Silicone Caulk',
        spec: 'bath/kitchen grade, white',
        qty: '1 tube',
        alt: ['Polyurethane caulk']
      }
    ],
    tools: [
      {
        name: 'Caulk gun',
        purpose: 'dispense evenly'
      }
    ],
    steps: [
      'Remove old caulk',
      'Clean and dry surface',
      'Apply new caulk'
    ],
    likelihood: {
      toilet_caulk: 0.85
    },
    safety: [
      'Ensure proper ventilation',
      'Wear gloves'
    ]
  };

  test('should validate correct analysis result', () => {
    expect(() => validateModelOutput(validAnalysis)).not.toThrow();
    const result = validateModelOutput(validAnalysis);
    expect(result).toEqual(validAnalysis);
  });

  test('should throw error for missing required fields', () => {
    const invalidAnalysis = {
      materials: [],
      tools: []
      // missing steps
    };

    expect(() => validateModelOutput(invalidAnalysis))
      .toThrow('Model output validation failed');
  });

  test('should throw error for invalid material structure', () => {
    const invalidAnalysis = {
      materials: [
        {
          // missing name
          spec: 'some spec'
        }
      ],
      tools: [],
      steps: []
    };

    expect(() => validateModelOutput(invalidAnalysis))
      .toThrow('Model output validation failed');
  });

  test('should throw error for invalid likelihood values', () => {
    const invalidAnalysis = {
      materials: [{ name: 'Test material' }],
      tools: [{ name: 'Test tool' }],
      steps: ['Test step'],
      likelihood: {
        invalid_probability: 1.5 // > 1
      }
    };

    expect(() => validateModelOutput(invalidAnalysis))
      .toThrow('Model output validation failed');
  });

  test('should allow optional fields to be undefined', () => {
    const minimalAnalysis = {
      materials: [{ name: 'Test material' }],
      tools: [{ name: 'Test tool' }],
      steps: ['Test step']
    };

    expect(() => validateModelOutput(minimalAnalysis)).not.toThrow();
  });
});

describe('parseModelResponse', () => {
  const validJson = {
    materials: [{ name: 'Test material' }],
    tools: [{ name: 'Test tool' }],
    steps: ['Test step']
  };

  test('should parse plain JSON', () => {
    const response = JSON.stringify(validJson);
    const result = parseModelResponse(response);
    expect(result).toEqual(validJson);
  });

  test('should parse JSON wrapped in code blocks', () => {
    const response = '```json\n' + JSON.stringify(validJson) + '\n```';
    const result = parseModelResponse(response);
    expect(result).toEqual(validJson);
  });

  test('should parse JSON wrapped in generic code blocks', () => {
    const response = '```\n' + JSON.stringify(validJson) + '\n```';
    const result = parseModelResponse(response);
    expect(result).toEqual(validJson);
  });

  test('should throw error for invalid JSON', () => {
    const response = '{ invalid json }';
    expect(() => parseModelResponse(response))
      .toThrow('Failed to parse JSON');
  });

  test('should throw error for valid JSON with invalid schema', () => {
    const response = JSON.stringify({ invalid: 'structure' });
    expect(() => parseModelResponse(response))
      .toThrow('Model output validation failed');
  });
});

describe('createFallbackResponse', () => {
  test('should create valid fallback response', () => {
    const fallback = createFallbackResponse();
    
    expect(() => validateModelOutput(fallback)).not.toThrow();
    expect(fallback.materials).toHaveLength(1);
    expect(fallback.tools).toHaveLength(1);
    expect(fallback.steps.length).toBeGreaterThan(0);
    expect(fallback.likelihood?.unknown).toBe(1.0);
    expect(fallback.safety).toBeDefined();
  });
});