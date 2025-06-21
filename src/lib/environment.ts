export interface EnvironmentStatus {
  geminiApiKey: boolean;
  awsCredentials: boolean;
  errors: string[];
  warnings: string[];
}

export function checkEnvironmentSetup(): EnvironmentStatus {
  const status: EnvironmentStatus = {
    geminiApiKey: false,
    awsCredentials: false,
    errors: [],
    warnings: []
  };

  if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
    status.errors.push('NEXT_PUBLIC_GEMINI_API_KEY is not set. AI conversation features will not work.');
  } else {
    status.geminiApiKey = true;
  }

  const hasAwsRegion = !!process.env.AWS_REGION;
  const hasAwsAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
  const hasAwsSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
  
  if (hasAwsRegion && hasAwsAccessKey && hasAwsSecretKey) {
    status.awsCredentials = true;
  } else if (hasAwsRegion || hasAwsAccessKey || hasAwsSecretKey) {
    status.warnings.push('AWS credentials are partially configured. Database features may not work properly.');
  }

  return status;
}
