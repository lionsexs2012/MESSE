// Криптографические функции для клиента
class MessengerCrypto {
  constructor(password) {
    this.password = password;
  }

  // Генерация ключа из пароля
  async getKey() {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(this.password);
    const hash = await crypto.subtle.digest('SHA-256', passwordData);
    return await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Шифрование сообщения
  async encrypt(text) {
    const key = await this.getKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    };
  }

  // Расшифровка сообщения
  async decrypt(encryptedData, ivArray) {
    const key = await this.getKey();
    const encrypted = new Uint8Array(encryptedData);
    const iv = new Uint8Array(ivArray);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}
