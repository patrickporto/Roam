# Roam

**Seu conteúdo local, na palma da mão.**

Roam transforma suas pastas em uma experiência de consumo imersiva estilo TikTok. Navegue por imagens e vídeos com scroll vertical infinito, descubra conteúdo com o feed "For You", e organize tudo em perfis e álbuns — sem sair do seu computador.

![Roam](https://github.com/user/roam/raw/main/screenshots/preview.png)

## Por que Roam?

Você tem gigabytes de fotos e vídeos espalhados por pastas. Encontrar algo bonito, revisar memórias, ou simplesmente navegar pelo seu conteúdo exige abrir explorador de arquivos, clicar pasta por pasta, abrir arquivo por arquivo.

Roam elimina esse atrito:

- **Feed vertical infinito** — role para cima e para baixo como nas redes sociais
- **Perfis e Álbuns** — pastas raiz viram perfis, subpastas viram álbuns
- **For You** — feed algorítmico que mistura conteúdo recente e clássico
- **Favoritos** — salve o que ama e volte quando quiser
- **Varredura profunda** — indexa subpastas recursivamente, sem clique manual

## Como funciona

Adicione pastas do seu computador. Roam varre o conteúdo, cria um índice local, e apresenta tudo em uma interface fluida:

1. **Adicione uma pasta** — ela vira um Perfil
2. **Subpastas viram Álbuns** — organizados na página do perfil
3. **Role o feed** — imagens e vídeos em tela cheia, com transições suaves
4. **Descubra** — a aba "For You" recomenda conteúdo baseado em seus favoritos e metadados

## Privacidade total

- Nenhum dado sai do seu computador
- Sem telemetria, sem contas, sem serviços externos
- Seus arquivos são somente leitura — Roam nunca modifica, move ou apaga mídia

## Requisitos

- Windows 10/11 (x64)
- Node.js 20+

## Instalação

```bash
git clone https://github.com/user/roam.git
cd roam
npm install
npm run dev
```

Para empacotar o executável:

```bash
npm run package
```

O executável será gerado em `dist/`.

## Desenvolvimento

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia Vite + Electron em modo desenvolvimento |
| `npm run build` | Compila TypeScript e faz build do renderer |
| `npm run typecheck` | Verifica tipos TypeScript |
| `npm test` | Roda testes unitários (Vitest) |
| `npm run package` | Empacota o executável Windows |

## Tecnologia

- **Electron** — runtime desktop
- **React 18 + TypeScript** — interface
- **better-sqlite3** — índice de mídia e favoritos
- **Zustand** — gerenciamento de estado
- **react-virtual** — virtualização do feed

## Licença

MIT
