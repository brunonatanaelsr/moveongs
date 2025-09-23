# IMM "Liquid Glass" UI Samples

Coleção de componentes React + Tailwind CSS inspirados no visual "liquid glass" (iOS 17/18). Serve como ponto de partida para o front-end do IMM.

## Componentes

- `Shell.tsx`: Layout com background translúcido, highlights difusos e container responsivo.
- `ProfileCard.tsx`: Cartão de perfil com avatar arredondado, bio / links e botões contextuais.
- `FeedPost.tsx`: Post simples para o feed institucional / atividades internas.
- `PermissionGuard.tsx`: Wrapper para esconder/mostrar ações baseado em permissões calculadas via RBAC.

## Uso rápido

1. Copie os arquivos para seu projeto Next/React com Tailwind configurado (instale também `clsx` se utilizar o `Shell`).
2. Substitua o `tailwind.config.example.js` pelas tokens desejadas ou integre os valores ao seu config atual.
3. Ajuste a tipagem de permissões conforme o client do IMM (`useSession()` / `usePermissions()`).
4. Use o `Shell` como layout base e componha os cards / listas de acordo com o módulo.

> Os estilos usam utilitários do Tailwind + classes adicionais (`bg-white/5`, `backdrop-blur-3xl`, `border-white/10`). Garanta que o Tailwind esteja com `safelist` ou `content` apontando para esses arquivos.
