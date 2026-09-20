// ピッカーと確認ダイアログを Promise で開くための共有状態。
// 呼び出し側は await openPicker(...) / await openConfirm(...) で結果を受け取る。
export const dialogs = $state({ picker: null, confirm: null });

export function openPicker({ title, candidates, describe }) {
  if (!candidates.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    dialogs.picker = {
      title,
      candidates,
      describe,
      resolve: (id) => {
        dialogs.picker = null;
        resolve(id);
      }
    };
  });
}

export function openConfirm({ title, body, okLabel = "削除", tone = "danger" }) {
  return new Promise((resolve) => {
    dialogs.confirm = {
      title,
      body,
      okLabel,
      tone,
      resolve: (result) => {
        dialogs.confirm = null;
        resolve(result);
      }
    };
  });
}
