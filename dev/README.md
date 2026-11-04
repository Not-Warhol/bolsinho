# Bolsinho: código e testes

- `bolsinho.html`: a app inteira, num só ficheiro.
- `build_pwa.py`: gera a versão para o ecrã principal (index.html, cartao.html, sw.js, ícones) na raiz do repositório.
- `tests/`: testes automáticos com o motor do Safari (Playwright + WebKit), em 4 tamanhos de iPhone.

```bash
python3 dev/build_pwa.py
cd dev/tests && npm install && npx playwright install webkit && npx playwright test
```

Os leitores de códigos independentes precisam de `pip install zxing-cpp pillow` e `brew install zbar`.
