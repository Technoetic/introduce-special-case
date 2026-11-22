import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as model from '../src/model.js';
import { LessonScreen } from '../src/lesson.js';

test('두 미확인 세대가 같은 표준 카드와 빈 이력을 공유하고 장부에는 원래 값이 남는다', () => {
  const first = { unit: '501호', resident: 'unknown' };
  const second = { unit: '502호', resident: 'unknown' };
  const card = model.residentFor(first);

  assert.strictEqual(model.residentFor(second), card);
  assert.equal(card.name, '입주자');
  assert.equal(card.isUnknown, true);
  assert.equal(card.complaintHistory.count, 0);
  assert.throws(() => { card.name = '수정'; }, TypeError);
  assert.throws(() => { card.complaintHistory.count = 1; }, TypeError);
  assert.equal(first.resident, 'unknown');
});

test('등록 세대는 실제 카드와 민원 0건을 유지한다', () => {
  const household = model.households.find(item => item.resident.complaintHistory?.count === 0);
  const card = model.residentFor(household);

  assert.strictEqual(card, household.resident);
  assert.equal(card.isUnknown, false);
  assert.notEqual(card.name, '입주자');
  assert.deepEqual(Object.keys(card).sort(), Object.keys(model.residentFor({ resident: 'unknown' })).sort());
});

test('세 가지 업무는 모든 예시에서 기대한 이름과 건수를 반환한다', () => {
  const expected = [
    ['101호', '입주자', 0],
    ['202호', '김민서', 2],
    ['303호', '박지우', 0],
  ];
  assert.equal(model.households.length, expected.length);
  for (const [unit, name, count] of expected) {
    const household = model.households.find(item => item.unit === unit);
    const outputs = {
      mail: `${unit} ${name}님, 즐거운 명절 보내세요.`,
      parcel: `${unit} ${name}님, 택배가 도착했습니다.`,
      requests: count,
    };
    assert.deepEqual(model.beforeOutputs(household), outputs);
    assert.deepEqual(model.afterOutputs(household), outputs);
  }
});

test('비교 결과에는 각 업무의 실제 전후 값과 동등 여부가 들어 있다', () => {
  const report = model.verifyHouseholds();
  assert.equal(report.length, 3);
  for (const { household, comparisons } of report) {
    const before = model.beforeOutputs(household);
    const after = model.afterOutputs(household);
    assert.deepEqual(comparisons.map(item => item.key), ['mail', 'parcel', 'requests']);
    for (const item of comparisons) {
      assert.strictEqual(item.before, before[item.key]);
      assert.strictEqual(item.after, after[item.key]);
      assert.equal(item.matches, true);
    }
  }
});

test('계약에 없는 누락·손상 값은 미확인 세대로 처리하지 않는다', () => {
  for (const resident of [undefined, null, '', 'UNKNOWN', {}, { name: '김민서', complaintHistory: { count: -1 } }]) {
    const household = { unit: '501호', resident };
    assert.throws(() => model.beforeOutputs(household), TypeError);
    assert.throws(() => model.afterOutputs(household), TypeError);
  }
});

test('2단계에는 공용 카드의 실제 선언과 선택한 업무에 카드를 건네는 호출이 보인다', async () => {
  const source = (await readFile(new URL('../src/model.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const declaration = source.match(/const UNKNOWN_RESIDENT = Object\.freeze\(\{[\s\S]*?\n\}\);/)[0];
  const codePanels = {};
  const root = { addEventListener() {}, querySelector() { return codePanels; } };
  const lesson = new LessonScreen(root);
  lesson.render('refactor');
  assert.ok(root.innerHTML.replaceAll('&#39;', "'").includes(declaration));
  for (const service of model.services) {
    lesson.activate({ dataset: { lessonAction: 'service' }, value: service.key, closest: () => null });
    const fn = model.implementations[service.key].after;
    assert.ok(codePanels.innerHTML.includes(`const card = residentFor(household);\n${fn.name}(household.unit, card);`));
  }
});
