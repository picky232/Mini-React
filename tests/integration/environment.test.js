// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

// 엔진 통합 테스트가 아니라 DOM·이벤트·테스트 간 정리 환경을 확인한다.
test('HTML의 공백 텍스트와 이벤트를 DOM 환경에서 다룰 수 있다', () => {
  const host = document.createElement('div');
  host.innerHTML = '<button disabled>Patch</button> <span>ready</span>';
  document.body.append(host);

  const button = host.querySelector('button');
  const onClick = vi.fn();
  button.addEventListener('click', onClick);

  expect(host.childNodes).toHaveLength(3);
  expect(host.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
  expect(button.getAttribute('disabled')).toBe('');

  button.removeAttribute('disabled');
  button.click();
  expect(onClick).toHaveBeenCalledOnce();
});

test('다음 테스트에는 이전 DOM fixture가 남지 않는다', () => {
  expect(document.body.childNodes).toHaveLength(0);
});
