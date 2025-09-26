import '@testing-library/jest-dom/vitest';
import React from 'react';
import './tests/server.ts';

// Vitest em modo CJS não injeta automaticamente o runtime JSX.
// Garantimos que os componentes client-side encontrem React no escopo global.
globalThis.React = React;
