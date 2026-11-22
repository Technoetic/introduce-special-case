import { afterOutputs, beforeOutputs, households, implementations, residentFor, services, verifyHouseholds } from './model.js';

const steps = {
  observe: ['01', '같은 질문을 몇 번 할까요?', '세대를 골라 보세요. 우편·택배·민원 담당자가 장부에서 무엇을 읽고 어떤 답을 내는지 확인할 수 있습니다.'],
  refactor: ['02', '창구에서 표준 카드를 건네면?', '미확인 세대에는 창구가 표준 카드 한 장을 건넵니다. 같은 업무의 코드를 바꾸기 전과 후로 나란히 읽어 보세요.'],
  verify: ['03', '세대가 달라도 결과가 같을까요?', '같은 장부로 기존 코드와 새 코드를 실행해 우편 문구, 택배 알림, 민원 건수를 비교합니다.'],
};

const questions = [
  { key: 'count', label: '민원 건수가 0인지 본다', feedback: '303호 박지우 님도 민원이 0건입니다. 이 기준을 쓰면 등록을 마친 세대에도 안내를 보내게 됩니다.' },
  { key: 'flag', label: '카드의 isUnknown을 본다', feedback: '맞습니다. 표준 카드만 isUnknown 값이 true입니다. 전입 안내 담당자는 이 표시로 대상을 고를 수 있습니다.' },
  { key: 'name', label: '이름이 ‘입주자’인지 본다', feedback: '‘입주자’는 우편에 쓸 기본 호칭입니다. 호칭을 ‘세대주’로 바꾸더라도 미확인 여부를 알 수 있는 표시를 찾아보세요.' },
];

const standardCardDeclaration = `const UNKNOWN_RESIDENT = Object.freeze({
  name: '입주자',
  complaintHistory: Object.freeze({ count: 0 }),
  isUnknown: true,
});`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function caseLabel(household) {
  return `${household.unit} · ${household.resident === 'unknown' ? '미확인' : household.resident.name}`;
}

function outputText(key, value) {
  return key === 'requests' ? `${value}건` : value;
}

function lessonHeader(route) {
  const [number, title, description] = steps[route];
  return `<header class="lesson-head">
    <p class="eyebrow">STEP ${number} / 03</p>
    <h2 data-lesson-heading tabindex="-1">${title}</h2>
    <p>${description}</p>
  </header>`;
}

function picker(label, action, options, selected) {
  return `<div class="case-picker" role="group" aria-label="${label}">${options.map(({ value, text }) =>
    `<button type="button" data-lesson-action="${action}" value="${escapeHtml(value)}" aria-pressed="${value === selected}">${escapeHtml(text)}</button>`
  ).join('')}</div>`;
}

function footer(previous, next) {
  const link = (item, secondary) => item ? `<a class="button${secondary ? ' secondary' : ''}" href="#/${item[0]}">${secondary ? '<span aria-hidden="true">←</span> ' : ''}${item[1]}${secondary ? '' : ' <span aria-hidden="true">→</span>'}</a>` : '';
  return `<nav class="lesson-foot" aria-label="실습 단계 이동">${link(previous, true)}${link(next, false)}</nav>`;
}

function observedPanels(household) {
  const unknown = household.resident === 'unknown';
  const results = beforeOutputs(household);
  const stored = household.resident;
  return `<article class="panel resident-panel">
    <div class="panel-head"><h3>${escapeHtml(household.unit)} 세대 장부</h3></div>
    <dl class="card-fields">
      <div><dt>입주자 칸</dt><dd>${unknown ? '<code>\'unknown\'</code> 쪽지' : '등록 입주자 카드'}</dd></div>
      <div><dt>이름</dt><dd>${unknown ? '미확인' : escapeHtml(stored.name)}</dd></div>
      <div><dt>민원 이력</dt><dd>${unknown ? '카드 없음' : `${escapeHtml(stored.complaintHistory.count)}건`}</dd></div>
    </dl>
  </article>
  <article class="panel"><div class="panel-head"><h3>업무별 처리 결과</h3></div>
    <ul class="results">${services.map(({ key, label }) => {
      const path = key === 'requests' ? (unknown ? '기본값 0건' : '카드의 민원 이력') : (unknown ? '기본 호칭 ‘입주자’' : '카드의 이름');
      return `<li><div><strong>${label}</strong><small>${unknown ? '미확인' : '등록'} → ${path}</small></div><p>${escapeHtml(outputText(key, results[key]))}</p></li>`;
    }).join('')}</ul>
  </article>`;
}

function observation(household) {
  return `${picker('장부를 열 세대', 'case', households.map(item => ({ value: item.unit, text: caseLabel(item) })), household.unit)}
    <div class="experiment-grid" data-observation>${observedPanels(household)}</div>
    ${footer(null, ['refactor', '표준 카드로 바꾸기'])}`;
}

function codeBlock(source) {
  return `<pre tabindex="0" aria-label="자바스크립트 코드"><code>${escapeHtml(String(source))}</code></pre>`;
}

function codePanels(service, household) {
  const key = service.key;
  const { before, after } = implementations[key];
  const call = `const card = residentFor(household);\n${after.name}(household.unit, card);`;
  const block = (title, source, value) => `<article class="panel">
    <div class="panel-head"><h3>${title}</h3></div>${codeBlock(source)}
    <p class="code-output"><strong>${escapeHtml(household.unit)} 실행값</strong> ${escapeHtml(outputText(key, value))}</p>
  </article>`;
  return block('변경 전 · 담당자가 확인', before, beforeOutputs(household)[key]) +
    block('변경 후 · 카드에서 읽기', `${after}\n\n${call}`, afterOutputs(household)[key]);
}

function refactoring(service, household) {
  return `${picker('비교할 업무', 'service', services.map(({ key, label }) => ({ value: key, text: label })), service.key)}
    <div class="code-grid" data-code-panels>${codePanels(service, household)}</div>
    <article class="panel boundary-panel"><div class="panel-head"><h3>장부와 담당자 사이의 창구</h3></div>
      <div class="boundary-grid">${codeBlock(standardCardDeclaration)}${codeBlock(residentFor)}</div>
      <p>창구가 <code>'unknown'</code>을 한 번 확인해 공용 카드를 건넵니다. 장부에는 쪽지가 그대로 남고, 우편·택배·민원 담당자는 카드의 값을 읽어 종전과 같은 답을 냅니다.</p>
      <p>미확인 세대가 이 카드 한 장을 함께 쓰므로 카드와 그 안의 민원 이력을 모두 <code>Object.freeze</code>로 잠급니다.</p>
      <p><code>checkedResident</code>는 등록 카드의 형식을 검사합니다. 장부 값이 <code>null</code>이거나 민원 건수가 손상되면 오류를 알립니다.</p>
    </article>
    ${footer(['observe', '조건문 관찰'], ['verify', '결과 검증하기'])}`;
}

function verificationStatus(report) {
  if (!report) return `검증할 세대 ${households.length}곳 · 세대별 업무 ${services.length}개`;
  const comparisons = report.flatMap(row => row.comparisons);
  const matches = comparisons.filter(row => row.matches).length;
  return `총 ${comparisons.length}개 중 ${matches}개 일치 · ${comparisons.length - matches}개 불일치`;
}

function verificationRows(report, selected) {
  if (!report) return '';
  return report.map(({ household, comparisons }) => `<details class="verify-case"${household === selected ? ' open' : ''}>
    <summary>${escapeHtml(caseLabel(household))} <span>${comparisons.filter(row => row.matches).length}/${comparisons.length} 일치</span></summary>
    <div class="table-scroll"><table class="verify-table" aria-label="${escapeHtml(household.unit)} 업무별 실행값 비교">
      <thead><tr><th scope="col">업무</th><th scope="col">변경 전</th><th scope="col">변경 후</th><th scope="col">결과</th></tr></thead>
      <tbody>${comparisons.map(({ key, label, before, after, matches }) => `<tr>
        <th scope="row">${label}</th><td>${escapeHtml(outputText(key, before))}</td><td>${escapeHtml(outputText(key, after))}</td><td>${matches ? '일치' : '불일치'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </details>`).join('');
}

function verification(report, selected, answer) {
  const choice = questions.find(item => item.key === answer);
  return `<article class="panel verify-panel"><div class="panel-head"><h3>세대별 비교</h3>
      <button type="button" class="button" data-lesson-action="verify">${report ? '다시 검증' : '검증 실행'}</button></div>
    <p data-verification-status role="status">${verificationStatus(report)}</p>
    <div data-verification-results>${verificationRows(report, selected)}</div>
  </article>
  <article class="panel quiz-panel"><div class="panel-head"><h3>전입 안내는 누구에게 보낼까요?</h3></div>
    <p>전입 신고 안내는 미확인 세대만 받습니다. 담당자는 카드의 무엇을 보면 될까요?</p>
    ${picker('전입 안내 대상 판단 기준', 'answer', questions.map(item => ({ value: item.key, text: item.label })), answer)}
    <p data-quiz-feedback role="status">${choice?.feedback ?? ''}</p>
  </article>
  ${footer(['refactor', '전후 코드 보기'], ['observe', '처음부터 살펴보기'])}`;
}

export class LessonScreen {
  constructor(root) {
    this.root = root;
    this.household = households[0];
    this.service = services[0];
    this.report = null;
    this.answer = null;
    root.addEventListener('click', event => {
      const button = event.target.closest('button[data-lesson-action]');
      if (button && root.contains(button)) this.activate(button);
    });
  }

  render(route) {
    const content = {
      observe: () => observation(this.household),
      refactor: () => refactoring(this.service, this.household),
      verify: () => verification(this.report, this.household, this.answer),
    };
    this.root.innerHTML = lessonHeader(route) + content[route]();
  }

  activate(button) {
    const action = button.dataset.lessonAction;
    const group = button.closest('.case-picker');
    if (group) {
      for (const option of group.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option === button));
    }
    switch (action) {
      case 'case':
        this.household = households.find(item => item.unit === button.value);
        this.root.querySelector('[data-observation]').innerHTML = observedPanels(this.household);
        break;
      case 'service':
        this.service = services.find(item => item.key === button.value);
        this.root.querySelector('[data-code-panels]').innerHTML = codePanels(this.service, this.household);
        break;
      case 'answer':
        this.answer = button.value;
        this.root.querySelector('[data-quiz-feedback]').textContent = questions.find(item => item.key === this.answer).feedback;
        break;
      case 'verify':
        this.report = verifyHouseholds();
        this.root.querySelector('[data-verification-results]').innerHTML = verificationRows(this.report, this.household);
        this.root.querySelector('[data-verification-status]').textContent = verificationStatus(this.report);
        button.textContent = '다시 검증';
        break;
    }
  }
}
