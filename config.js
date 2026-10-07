window.CONFIG = {
  // URL do App da Web do Google Apps Script (termina com /exec).
  // Usada para buscar foto e preço dos produtos.
  API_URL: 'https://script.google.com/macros/s/AKfycbw3al3-q0NAGSEamyUmP3hIryMJ62SrU7PB9cisdQBtib_AtTvArdB9n_DF2bSSZqW2HQ/exec',

  // Configuração do Firebase (Configurações do projeto > Seus apps > Web).
  // A apiKey do Firebase não é secreta: quem protege os dados são as regras (firestore.rules).
  FIREBASE: {
    apiKey: 'AIzaSyBTg8x5pA9v81vemt1kcgDg4SyKGtZJOiA',
    projectId: 'lista-de-presente-f28f0',
  },
};
