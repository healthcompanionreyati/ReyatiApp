export const foundationFlags = {
  independentAuthentication: false,
  outboundEmailDelivery: false,
  outboundSmsDelivery: false,
  communicationsWebhooks: false,
  medicalDocumentUploads: false,
  documentScanCallbacks: false,
  documentDeletionProcessor: false,
  privateDocumentDelivery: false,
  documentUploadCleanup: false,
  documentScanRecovery: false,
} as const;

export function assertFoundationCapabilityDisabled(capability: keyof typeof foundationFlags) {
  if (foundationFlags[capability]) {
    throw new Error(`Foundation capability ${capability} requires an approved activation review.`);
  }
}
