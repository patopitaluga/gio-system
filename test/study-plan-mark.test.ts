import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markStudyPlanItemInContent } from '../lib/study-plan-mark.ts';

const SAMPLE_PLAN = `# Plan

- **28 de junio (Domingo):**
  - [ ] Aprender pronombres personales.
  - [ ] Practicar saludos y presentaciones.

- **29 de junio (Lunes):**
  - [ ] Escribir diálogos simples.
`;

describe('markStudyPlanItemInContent', () => {
  it('marks the matching unchecked item for today', () => {
    const { content, marked } = markStudyPlanItemInContent(
      SAMPLE_PLAN,
      'Practicar saludos',
      '28 de junio (Domingo)',
    );

    assert.equal(marked, 'Practicar saludos');
    assert.match(content, /- \[x\] Practicar saludos y presentaciones\./);
    assert.match(content, /- \[ \] Aprender pronombres personales\./);
    assert.match(content, /- \[ \] Escribir diálogos simples\./);
  });

  it('throws when the day entry is missing', () => {
    assert.throws(
      () => markStudyPlanItemInContent(SAMPLE_PLAN, 'Practicar saludos', '1 de julio (Miércoles)'),
      /No plan entry/,
    );
  });

  it('throws when no unchecked item matches', () => {
    assert.throws(
      () => markStudyPlanItemInContent(SAMPLE_PLAN, 'Vocabulario de viajes', '28 de junio (Domingo)'),
      /Could not find plan item/,
    );
  });

  it('treats an already checked item as success', () => {
    const alreadyMarked = SAMPLE_PLAN.replace(
      '- [ ] Escribir diálogos simples.',
      '- [x] Escribir diálogos simples.',
    );

    const { content, marked } = markStudyPlanItemInContent(
      alreadyMarked,
      'Escribir diálogos simples',
      '29 de junio (Lunes)',
    );

    assert.equal(marked, 'Escribir diálogos simples');
    assert.equal(content, alreadyMarked);
  });
});
