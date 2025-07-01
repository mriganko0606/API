import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import vertexaiPkg from '@google-cloud/vertexai';
const { VertexAI } = vertexaiPkg;
import path from 'path';
import { fileURLToPath } from 'url';
import { getVertexCredentials } from './credentials.js';
import fs from 'fs';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '100mb' })); // Middleware to parse JSON
app.use(express.urlencoded({ limit: '100mb', extended: true, parameterLimit: 50000 }));

// Load environment variables
// Load environment variables based on NODE_ENV
if (process.env.NODE_ENV === 'production') {
  // In production, we rely on Vercel's environment variables
  console.log('Running in production mode');
} else {
  // In development, load from .env file
  dotenv.config();
  console.log('Running in development mode');
}

// Add restrictive CORS for Vercel frontend only
const allowedOrigins = [
  'https://uploadory-results-git-dev-bhav11eshs-projects.vercel.app',
  'http://www.dentifrice.in',
  'https://www.dentifrice.in',
  'https://uploadory-results-git-main-bhav11eshs-projects.vercel.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Supabase setup
const supabaseUrl = 'https://egknfpmtqfmujnnrqcuk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVna25mcG10cWZtdWpubnJxY3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk1NDEwMjMsImV4cCI6MjA0NTExNzAyM30.rCeOiqLc_f3ReRskAE0MfNp_1ObTxckZY7HJBHANneI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Google Vertex AI setup
const project = 'axiomatic-skill-447818-k6';
const location = 'us-central1';
const visionModel = 'gemini-2.0-flash';
//const visionModel = 'gemini-pro-vision';

// Initialize Vertex AI with proper error handling
let vertexAI;
let generativeVisionModel;

try {
  if (process.env.VERTEX_JSON_BASE64) {
    const credsPath = path.join(process.cwd(), 'vertex_credentials.json');
    const decoded = Buffer.from(process.env.VERTEX_JSON_BASE64, 'base64').toString('utf8');
    fs.writeFileSync(credsPath, decoded);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
    console.log('Service account credentials written to vertex_credentials.json');
  } else {
    throw new Error('VERTEX_JSON_BASE64 not set — cannot load credentials');
  }

  vertexAI = new VertexAI({
    project,
    location
  });

  console.log('Loading generative vision model:', visionModel);
  generativeVisionModel = vertexAI.getGenerativeModel({ 
    model: visionModel,
    // Add safety settings to prevent content filtering issues
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE'
      }
    ]
  });

  // Test the connection
  console.log('Testing Vertex AI connection...');
  const testRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Hello' }]
      }
    ]
  };
  await generativeVisionModel.generateContent(testRequest, {
    generationConfig: {
      temperature: 0.2,
      topP: 0.8
    }
  });
  console.log('Vertex AI initialization and connection test successful');
} catch (error) {
  console.error('Error initializing Vertex AI:', {
    error: error.message,
    stack: error.stack,
    name: error.name
  });
  
  if (error.message.includes('authentication')) {
    console.error('Authentication error. Please check:');
    console.error('1. Service account permissions in Google Cloud Console');
    console.error('2. Environment variables are properly set');
    console.error('3. Service account has access to Vertex AI API');
  }
  
  // We'll still create the server but Vertex AI features won't work
  vertexAI = null;
  generativeVisionModel = null;
}

// Load dental antibiotics data
const dentalAntibiotics = JSON.parse(fs.readFileSync(path.join(__dirname, 'dental_antibiotics.json'), 'utf8'));

// Function to increment total runs
const incrementTotalRuns = async (userId) => {
  const { error } = await supabase.rpc('increment_total_runs', { user_id_param: userId });
  if (error) {
    console.error('Error incrementing total runs:', error);
  }
};

// Format patient info into structured text
const formatPatientInfo = (formData) => {
  return `
Patient ID: ${formData.patientId}
Name: ${formData.firstName} ${formData.lastName}
Age: ${formData.age}
Gender: ${formData.gender}
Contact: ${formData.contactNumber}
Email: ${formData.email || 'Not provided'}
Address: ${formData.streetAddress}, ${formData.city}, ${formData.state} ${formData.postalCode}, ${formData.country}

Medical Screening: ${formData.medicalScreening || 'None provided'}
Allergies: ${formData.allergies || 'None reported'}

Medical History: 
${Object.entries(formData.medicalHistory || {})
  .filter(([_, value]) => value)
  .map(([key]) => `- ${key}`)
  .join('\n')}

Dental History:
${Object.entries(formData.dentalHistory || {})
  .filter(([_, value]) => value)
  .map(([key]) => `- ${key}`)
  .join('\n')}
`;
};

// API Route: Analyze X-ray Image
app.post('/api/analyze-xray', async (req, res) => {
  try {
    if (!generativeVisionModel) {
      throw new Error('Vertex AI is not properly initialized. Please check your Google Cloud credentials.');
    }

    console.log('Received analyze-xray request');
    const { formData, imageUrl, userId } = req.body;

    if (!formData || !imageUrl || !userId) {
      console.error('Missing required parameters:', { formData: !!formData, imageUrl: !!imageUrl, userId: !!userId });
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Validate image format
    if (!imageUrl.startsWith('data:image/')) {
      console.error('Invalid image format. Expected data URL');
      return res.status(400).json({ error: 'Invalid image format. Expected data URL' });
    }

    // Extract and validate base64 data
    const base64Data = imageUrl.split(',')[1];
    if (!base64Data) {
      console.error('Invalid base64 data format');
      return res.status(400).json({ error: 'Invalid base64 data format' });
    }

    // Log the first few characters of the base64 data for debugging
    console.log('Base64 data preview:', base64Data.substring(0, 50) + '...');

    const patientInfo = formatPatientInfo(formData);
    console.log('Formatted patient info:', patientInfo);

    // 1. First prompt: General report
    const reportRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `You are a dental surgeon and radiography expert. Create a detailed report for the provided dental X-ray. Focus on identifying specific conditions and problems. Patient Info:\n${patientInfo}` },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ],
        },
      ],
    };
    const reportResponse = await generativeVisionModel.generateContent(reportRequest, {
      generationConfig: {
        temperature: 0.2,
        topP: 0.8
      }
    });
    if (!reportResponse.response || !reportResponse.response.candidates || reportResponse.response.candidates.length === 0) {
      throw new Error('No response candidates received from the model.');
    }
    const generalReport = reportResponse.response.candidates[0]?.content?.parts?.[0]?.text || 'No valid content received.';

    // 2. Second prompt: Extract disease name and match with antibiotics data
    const diseaseRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Based on the following dental report, identify the most likely dental disease or condition. Here is the list of possible conditions and their treatments:\n\n${JSON.stringify(dentalAntibiotics, null, 2)}\n\nDental Report:\n${generalReport}\n\nRespond with ONLY the exact disease name from the list above that best matches the condition described in the report.If any match is found then provide the treatment for that disease based on the list above. If no exact match is found, respond with "No exact match found".Provide in the markdown format.` }
          ],
        },
      ],
    };
    const diseaseResponse = await generativeVisionModel.generateContent(diseaseRequest, {
      generationConfig: {
        temperature: 0.2,
        topP: 0.8
      }
    });
    if (!diseaseResponse.response || !diseaseResponse.response.candidates || diseaseResponse.response.candidates.length === 0) {
      throw new Error('No response candidates received for disease extraction.');
    }
    const diseaseName = diseaseResponse.response.candidates[0]?.content?.parts?.[0]?.text?.trim();

    // 3. Extract treatment information
    const treatmentInfo = diseaseResponse.response.candidates[0]?.content?.parts?.[0]?.text?.trim();

    // 4. Update patient record
    if (formData.patientId) {
      const { error: updateError } = await supabase
        .from('patients')
        .update({
          analysis: JSON.stringify({
            disease: diseaseName,
            treatment: treatmentInfo,
            report: generalReport,
            timestamp: new Date().toISOString()
          }),
          treatment: JSON.stringify(treatmentInfo)
        })
        .eq('patient_id', formData.patientId);

      if (updateError) {
        console.error('Error updating patient record:', updateError);
      }
    }

    // 5. Increment usage count
    await incrementTotalRuns(userId);

    // 6. Respond
    res.json({
      report: generalReport,
      disease: diseaseName
    });
  } catch (error) {
    console.error('Error generating dental report:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      type: error.name
    });
  }
});

// Add Gemini chat endpoint directly
app.post('/api/gemini-chat', async (req, res) => {
  const { message } = req.body;
  console.log('Received message:', message);
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (!generativeVisionModel) {
    return res.status(500).json({ error: 'Vertex AI is not properly initialized.' });
  }
  try {
    const chatRequest = {
      contents: [
        { role: 'user', parts: [{ text: message }] },
      ],
    };
    const response = await generativeVisionModel.generateContent(chatRequest, {
      generationConfig: {
        temperature: 0.2,
        topP: 0.8
      }
    });
    const aiText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
    res.json({ reply: aiText });
  } catch (error) {
    console.error('Gemini Vertex AI error:', error);
    res.status(500).json({ error: 'Failed to get response from Gemini Pro.', details: error.message });
  }
});

// Set the port
const PORT = process.env.PORT || 3002;

// Start the server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

// Export the app for Vercel
export default app;