import type { PaymentProvider, PaymentType, MethodDefaultLimits } from './types';

export class PaymentProviderRegistry {
  private providers = new Map<PaymentType, PaymentProvider>();
  private _ensureInitialized: (() => void) | null = null;

  /** 设置 lazy init 回调，由 initPaymentProviders 注入 */
  setInitializer(fn: () => void): void {
    this._ensureInitialized = fn;
  }

  private autoInit(): void {
    if (this._ensureInitialized) {
      this._ensureInitialized();
    }
  }

  register(provider: PaymentProvider): void {
    for (const type of provider.supportedTypes) {
      this.providers.set(type, provider);
    }
  }

  getProvider(type: PaymentType): PaymentProvider {
    this.autoInit();
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No payment provider registered for type: ${type}`);
    }
    return provider;
  }

  hasProvider(type: PaymentType): boolean {
    this.autoInit();
    return this.providers.has(type);
  }

  getSupportedTypes(): PaymentType[] {
    this.autoInit();
    return Array.from(this.providers.keys());
  }

  /** 获取指定渠道的提供商默认限额（未注册时返回 undefined） */
  getDefaultLimit(type: string): MethodDefaultLimits | undefined {
    this.autoInit();
    const provider = this.providers.get(type as PaymentType);
    return provider?.defaultLimits?.[type];
  }

  /** 获取指定渠道对应的提供商 key（如 'easypay'、'stripe'） */
  getProviderKey(type: string): string | undefined {
    this.autoInit();
    const provider = this.providers.get(type as PaymentType);
    return provider?.providerKey;
  }
}

export const paymentRegistry = new PaymentProviderRegistry();
