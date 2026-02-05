const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 9;

export const generateShortId = (): string => {
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return id;
};
