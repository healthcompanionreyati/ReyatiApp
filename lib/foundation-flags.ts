export const foundationFlags = {
  independentAuthentication: false,
  outboundEmailDelivery: false,
  outboundSmsDelivery: false,
  communicationsWebhooks: false,
} as const;

export function assertFoundationCapabilityDisabled(capability: keyof typeof foundationFlags) {
  if (foundationFlags[capability]) {
    throw new Error(`Foundation capability ${capability} requires an approved activation review.`);
  }
}
