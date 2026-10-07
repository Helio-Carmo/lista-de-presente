window.CONFIG = {
  // URL do App da Web do Google Apps Script (termina com /exec).
  // Usada para buscar foto e preço dos produtos (e para as listas, se o Firebase não estiver configurado).
  API_URL: 'https://script.google.com/macros/s/AKfycbw3al3-q0NAGSEamyUmP3hIryMJ62SrU7PB9cisdQBtib_AtTvArdB9n_DF2bSSZqW2HQ/exec',

  // Configuração do Firebase (Configurações do projeto > Seus apps > Web).
  // Enquanto estiver null, as listas continuam na Planilha Google.
  FIREBASE: null,
};
