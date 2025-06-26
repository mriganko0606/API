// Exports credentials helper for Vertex AI to use in both development and production
import fs from 'fs'; // Import fs module to prevent errors
import path from 'path'; // Import path module to prevent errors
export const getVertexCredentials = () => {
  try {
    // First try to get credentials from environment variable
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        // Parse and validate the credentials
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        
        // Validate required fields
        const requiredFields = [
          'type',
          'project_id',
          'private_key_id',
          'private_key',
          'client_email',
          'client_id',
          'auth_uri',
          'token_uri',
          'auth_provider_x509_cert_url',
          'client_x509_cert_url'
        ];

        const missingFields = requiredFields.filter(field => !credentials[field]);
        if (missingFields.length > 0) {
          console.error('Missing required fields in credentials:', missingFields);
          return null;
        }

        // Format private key
        credentials.private_key = credentials.private_key
          .replace(/\\n/g, '\n')
          .replace(/\n/g, '\n')
          .trim();

        // Validate private key format
        if (!credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----') || 
            !credentials.private_key.endsWith('-----END PRIVATE KEY-----')) {
          console.error('Invalid private key format');
          return null;
        }

        console.log('Successfully loaded and validated credentials from environment variable');
        return credentials;
      } catch (e) {
        console.error('Error parsing GOOGLE_CREDENTIALS_JSON:', e);
      }
    }

    // If running in development, try to use the service account key file
    if (process.env.NODE_ENV !== 'production') {
      try {
        // const fs = require('fs');
        // const path = require('path');
        const credentialsPath = path.join(process.cwd(), 'vertex_vikram_key_google_account.json');
        
        if (fs.existsSync(credentialsPath)) {
          const fileContent = fs.readFileSync(credentialsPath, 'utf8');
          console.log('Raw file content:', fileContent.substring(0, 100) + '...');
          
          const credentials = JSON.parse(fileContent);
          
          // Validate required fields
          const requiredFields = [
            'type',
            'project_id',
            'private_key_id',
            'private_key',
            'client_email',
            'client_id',
            'auth_uri',
            'token_uri',
            'auth_provider_x509_cert_url',
            'client_x509_cert_url'
          ];

          const missingFields = requiredFields.filter(field => !credentials[field]);
          if (missingFields.length > 0) {
            console.error('Missing required fields in credentials file:', missingFields);
            return null;
          }

          // Format private key
          credentials.private_key = credentials.private_key
            .replace(/\\n/g, '\n')
            .replace(/\n/g, '\n')
            .trim();

          console.log('Private key starts with:', credentials.private_key.substring(0, 50) + '...');
          console.log('Private key ends with:', '...' + credentials.private_key.substring(credentials.private_key.length - 50));

          // Validate private key format
          if (!credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----') || 
              !credentials.private_key.endsWith('-----END PRIVATE KEY-----')) {
            console.error('Invalid private key format in file');
            return null;
          }

          console.log('Successfully loaded and validated credentials from file');
          return credentials;
        } else {
          console.error('Credentials file not found at:', credentialsPath);
          return null;
        }
      } catch (e) {
        console.error('Error loading credentials file:', e);
        return null;
      }
    }

    console.error('No credentials found in environment or file');
    return null;
  } catch (error) {
    console.error('Error in getVertexCredentials:', error);
    return null;
  }
}; 