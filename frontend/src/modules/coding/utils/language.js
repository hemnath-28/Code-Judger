export const languages = [
  { id: 'python', label: 'Python 3.12', monaco: 'python' },
  { id: 'java', label: 'Java 21', monaco: 'java' },
  { id: 'cpp', label: 'C++17', monaco: 'cpp' }
];

export function getMonacoLanguage(language) {
  return languages.find((item) => item.id === language)?.monaco || 'plaintext';
}

export function getLanguageLabel(language) {
  return languages.find((item) => item.id === language)?.label || language;
}
