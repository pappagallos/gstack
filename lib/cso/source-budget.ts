import { CsoError } from './contracts';

// 전체 입력 한도만 명시적으로 확장하며 파일별 읽기와 비밀정보 가림 한도는 유지한다.
export function sourceBudgetMiB(value: number | string = 64): number {
  const amount = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > 1024)
    throw new CsoError('INVALID_ARGUMENT', 'Source budget must be an integer from 1 to 1024 MiB');
  return amount;
}
