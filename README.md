# 🎁 Lista de Presentes — Amigo Secreto

Site para a família montar a lista de presentes do amigo secreto.
Cada pessoa cria a sua lista, adiciona produtos de qualquer loja (Shopee, Mercado Livre, Amazon…)
e todo mundo pode ver as listas de todos.

- **Site:** hospedado de graça no GitHub Pages
- **Dados:** ficam numa Planilha Google (dá pra abrir e exportar para Excel quando quiser)

---

## Passo 1 — Criar a planilha e o "servidor" (5 minutos)

1. Acesse [sheets.new](https://sheets.new) para criar uma planilha nova. Dê um nome, ex: **Amigo Secreto**.
2. No menu, vá em **Extensões → Apps Script**.
3. Apague o que estiver escrito e cole **todo** o conteúdo do arquivo [`apps-script/Code.gs`](apps-script/Code.gs). Clique em 💾 **Salvar**.
4. Clique em **Implantar → Nova implantação**.
   - Em "Selecione o tipo" (ícone de engrenagem ⚙️), escolha **App da Web**.
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
   - Clique em **Implantar**.
5. O Google vai pedir autorização: clique em **Autorizar acesso**, escolha sua conta.
   Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)**.
   É normal, porque o script é seu mesmo.
6. Copie a **URL do app da Web** (termina com `/exec`).
7. Abra o arquivo [`config.js`](config.js) e cole a URL entre as aspas:

   ```js
   window.CONFIG = {
     API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   };
   ```

> Se um dia você alterar o `Code.gs`, precisa publicar de novo: **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. A URL continua a mesma.

## Passo 2 — Publicar no GitHub Pages

1. Crie uma conta em [github.com](https://github.com) (se ainda não tiver).
2. Clique em **New repository**, dê o nome `lista-de-presente`, deixe **Public** e crie.
3. Clique em **uploading an existing file** e arraste **todos os arquivos e pastas** deste projeto
   (`index.html`, `app.js`, `style.css`, `config.js`, `sw.js`, `manifest.webmanifest`, `icons/`…). Clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em "Branch", escolha **main** e pasta **/ (root)**, e clique em **Save**.
5. Depois de 1 ou 2 minutos, o site estará em:
   `https://SEU-USUARIO.github.io/lista-de-presente/`

## Passo 3 — Usar

1. Abra o site, crie o amigo secreto (ex: "Natal Família 2026").
2. Toque em **Convidar** e mande o link no grupo da família.
3. Cada pessoa toca em **Criar minha lista** e informa o nome (fica salvo no celular dela).

### Instalar como app (Android) — recomendado
No Chrome, abra o site → menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").

Pronto! Agora, no app da **Shopee**, **Mercado Livre** ou qualquer loja:
abra o produto → **Compartilhar** → escolha **Presentes**. O produto cai direto na sua lista. 🎉

### iPhone
No Safari, abra o site → botão **Compartilhar** → **Adicionar à Tela de Início**.
Para adicionar produtos: no app da loja, **Compartilhar → Copiar link**, volte para o app de presentes,
toque em **+ Adicionar → 📋 Colar**.

---

## Bom saber

- **Foto e nome** do produto costumam vir automaticamente. **Preço e desconto** dependem da loja:
  algumas (principalmente a Shopee) bloqueiam essa leitura. Nesse caso é só digitar o preço no formulário.
- Para mostrar o **desconto**, basta preencher "Preço sem desconto" (o preço riscado da loja).
- Ao tocar em **Ver na loja** no celular, o link normalmente abre direto no app da loja.
- Os dados ficam nas abas **Grupos**, **Participantes** e **Presentes** da planilha.
  Para baixar como Excel: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.
- Qualquer pessoa com o link do site pode ver as listas. Para a família isso é tranquilo,
  mas evite colocar informações pessoais nas observações.
