import { expect, test } from 'vitest';

test('순수 로직의 기본 테스트 환경에는 DOM 전역이 없다', () => {
  expect(typeof document).toBe('undefined');
  expect(typeof window).toBe('undefined');
});
