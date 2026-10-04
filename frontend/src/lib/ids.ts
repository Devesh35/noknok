const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I lookalikes

export function randomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// Client-generated ids, e.g. "a_K3M9QX". A backend will issue real ones.
export function newId(prefix: string): string {
  return `${prefix}_${randomCode()}`;
}
