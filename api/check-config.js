import { getVertexCredentials } from './credentials.js';

const checkConfig = () => {
  console.log('Checking environment configuration...');
  
  // Check required environment variables
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_LOCATION',
    'GOOGLE_CREDENTIALS_JSON'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
  } else {
    console.log('All required environment variables are set');
  }

  // Check Vertex AI credentials
  const credentials = getVertexCredentials();
  if (!credentials) {
    console.error('Failed to load Vertex AI credentials');
  } else {
    console.log('Vertex AI credentials loaded successfully');
    console.log('Project:', credentials.project_id);
    console.log('Client Email:', credentials.client_email);
  }

  // Check Supabase configuration
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    console.log('Supabase configuration is valid');
  } else {
    console.error('Invalid Supabase configuration');
  }
};

checkConfig(); 