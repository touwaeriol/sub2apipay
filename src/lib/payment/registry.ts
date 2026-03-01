import type { PaymentProvider, PaymentType } from './types';

export class PaymentProviderRegistry {
  private providers = new Map<PaymentType, PaymentProvider>();

  register(provider: PaymentProvider): void {
    for (const type of provider.supportedTypes) {
      this.providers.set(type, provider);
    }
  }

  getProvider(type: PaymentType): PaymentProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No payment provider registered for type: ${type}`);
    }
    return provider;
  }

  hasProvider(type: PaymentType): boolean {
    return this.providers.has(type);
  }

  getSupportedTypes(): PaymentType[] {
    return Array.from(this.providers.keys());
  }
}

export const paymentRegistry = new PaymentProviderRegistry();
