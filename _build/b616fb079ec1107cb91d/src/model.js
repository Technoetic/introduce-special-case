const UNKNOWN_RESIDENT = Object.freeze({
  name: '입주자',
  complaintHistory: Object.freeze({ count: 0 }),
  isUnknown: true,
});

function registeredResident(name, count) {
  return Object.freeze({
    name,
    complaintHistory: Object.freeze({ count }),
    isUnknown: false,
  });
}

export const households = Object.freeze([
  Object.freeze({ unit: '101호', resident: 'unknown' }),
  Object.freeze({ unit: '202호', resident: registeredResident('김민서', 2) }),
  Object.freeze({ unit: '303호', resident: registeredResident('박지우', 0) }),
]);

export const services = Object.freeze([
  { key: 'mail', label: '명절 우편' },
  { key: 'parcel', label: '택배 알림' },
  { key: 'requests', label: '민원 조회' },
]);

// Both versions read through the same storage contract. A broken record is an error.
function checkedResident(resident) {
  if (typeof resident?.name !== 'string' || !resident.name.trim() || resident.isUnknown !== false ||
      !Number.isSafeInteger(resident.complaintHistory?.count) || resident.complaintHistory.count < 0) {
    throw new TypeError('입주자 장부의 이름 또는 민원 이력을 확인해 주세요.');
  }
  return resident;
}

export function residentFor(household) {
  const raw = household.resident;
  return raw === 'unknown'
    ? UNKNOWN_RESIDENT
    : checkedResident(raw);
}

function mailTo(unit, name) {
  return `${unit} ${name}님, 즐거운 명절 보내세요.`;
}

function parcelTo(unit, name) {
  return `${unit} ${name}님, 택배가 도착했습니다.`;
}

function mailBefore(unit, r) {
  const name = r === 'unknown' ? '입주자' : r.name;
  return mailTo(unit, name);
}

function parcelBefore(unit, r) {
  const name = r === 'unknown' ? '입주자' : r.name;
  return parcelTo(unit, name);
}

function requestsBefore(_unit, r) {
  return r === 'unknown' ? 0 : r.complaintHistory.count;
}

function mailAfter(unit, card) {
  return mailTo(unit, card.name);
}

function parcelAfter(unit, card) {
  return parcelTo(unit, card.name);
}

function requestsAfter(_unit, card) {
  return card.complaintHistory.count;
}

export const implementations = {
  mail: { before: mailBefore, after: mailAfter },
  parcel: { before: parcelBefore, after: parcelAfter },
  requests: { before: requestsBefore, after: requestsAfter },
};

export function beforeOutputs(household) {
  const resident = household.resident;
  if (resident !== 'unknown') checkedResident(resident);
  return Object.fromEntries(services.map(({ key }) => [key, implementations[key].before(household.unit, resident)]));
}

export function afterOutputs(household) {
  const card = residentFor(household);
  return Object.fromEntries(services.map(({ key }) => [key, implementations[key].after(household.unit, card)]));
}

export function verifyHouseholds() {
  return households.map(household => {
    const before = beforeOutputs(household);
    const after = afterOutputs(household);
    const comparisons = services.map(({ key, label }) => ({
      key, label, before: before[key], after: after[key], matches: Object.is(before[key], after[key]),
    }));
    return { household, comparisons };
  });
}
