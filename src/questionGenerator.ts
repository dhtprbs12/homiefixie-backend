import OpenAI from 'openai';
import dotenv from 'dotenv';
if (process.env.NODE_ENV === 'production') {
  dotenv.config();
} else {
  dotenv.config({ path: '.env.local' }); // Loads .env for local development
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const QUESTION_GENERATION_PROMPT = `You are an expert home improvement consultant. Generate 2-4 precise follow-up questions that will help provide the most accurate material and tool recommendations for the given issue.

CRITICAL REQUIREMENTS:
1. Questions should eliminate ambiguity and prevent generic recommendations
2. Focus on details that directly impact material/tool selection
3. Generate questions that experienced contractors would ask
4. Make questions specific enough to choose between similar products (e.g., flexible caulk vs hydraulic cement)

QUESTION TYPES TO CONSIDER:
- Size/dimensions (exact measurements matter for materials)
- Location/environment (interior/exterior, moisture exposure, temperature)
- Existing conditions (what's currently there, condition, age)
- User experience level (affects tool recommendations and complexity)
- Materials involved (wood, metal, concrete, etc.)
- Urgency/budget constraints
- Safety considerations

AVOID GENERIC QUESTIONS. Instead ask specific ones like:
✓ "How wide is the crack?" (not "tell me about the crack")
✓ "Is this area exposed to water regularly?" (not "what's the environment?")
✓ "What type of surface are you working on?" (not "describe the area")

RESPOND WITH VALID JSON ONLY in this exact format:
{
  "category": "descriptive_category_name",
  "questions": [
    {
      "id": "question_1",
      "question": "Specific question text?",
      "type": "multiple_choice",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "required": true
    },
    {
      "id": "question_2", 
      "question": "Another specific question?",
      "type": "yes_no",
      "required": true
    }
  ]
}

IMPORTANT: 
- Use "multiple_choice" for most questions (3-5 options)
- Use "yes_no" for simple binary questions
- Use "text" only when specific details are needed
- Each question should have a short, descriptive ID (lowercase with underscores)
- Mark questions as required: true if they significantly impact recommendations`;

export async function generateQuestionsWithAI(description: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: QUESTION_GENERATION_PROMPT
        },
        {
          role: 'user',
          content: `Home improvement issue: "${description}"\n\nGenerate 2-4 follow-up questions to get precise recommendations.`
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent, focused questions
      max_tokens: 800
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Parse the JSON response
    let questionSet;
    try {
      questionSet = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Validate the response structure
    if (!questionSet.questions || !Array.isArray(questionSet.questions)) {
      throw new Error('Invalid question set structure');
    }

    // Validate each question
    for (const question of questionSet.questions) {
      if (!question.id || !question.question || !question.type) {
        throw new Error('Invalid question structure');
      }
      
      if (question.type === 'multiple_choice' && (!question.options || !Array.isArray(question.options))) {
        throw new Error('Multiple choice question missing options');
      }
    }

    return questionSet;

  } catch (error) {
    console.error('Error generating questions with AI:', error);
    
    // Return a simple fallback question set
    return {
      category: 'general',
      questions: [
        {
          id: 'location',
          question: 'Where exactly is this issue located?',
          type: 'multiple_choice',
          options: ['Interior', 'Exterior', 'Basement', 'Attic', 'Bathroom', 'Kitchen'],
          required: true
        },
        {
          id: 'urgency',
          question: 'How urgent is this repair?',
          type: 'multiple_choice',
          options: ['Emergency', 'High priority', 'Medium priority', 'Low priority'],
          required: true
        }
      ]
    };
  }
}