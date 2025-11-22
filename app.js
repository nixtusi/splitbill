// app.js

import { db, serverTimestamp } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  deleteDoc,       // ← 追加
  updateDoc        // ← 後で編集にも使うのでついでに
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* 共通：ランダムID生成 */
function generateId(length = 12) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// 最近使ったグループ一覧（ローカル履歴表示）
const historyList = document.getElementById("groupHistoryList");
if (historyList) {
  const HISTORY_KEY = "splitbill_group_history";
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (_) {
    history = [];
  }

  historyList.innerHTML = "";
  history.forEach((h) => {
    const li = document.createElement("li");
    li.className = "group-history-item";

    const a = document.createElement("a");
    a.href = h.url;
    a.textContent = h.name;

    li.appendChild(a);
    historyList.appendChild(li);
  });
}

/* 共通：カテゴリ→アイコン＋ラベル */
function getCategoryInfo(category) {
  switch (category) {
    case "food":
      return { icon: "🍚", label: "飲食" };
    case "transport":
      return { icon: "🚗", label: "交通" };
    case "lodging":
      return { icon: "🏨", label: "宿泊" };
    case "activity":
      return { icon: "🎡", label: "アクティビティ" };
    default:
      return { icon: "💰", label: "その他" };
  }
}

/* 共通：クエリパラメータから groupId 取得 */
function getGroupIdFromQuery() {
  const params = new URLSearchParams(location.search);
  return params.get("g");
}

/* ========== index.html（グループ作成） ========== */

const createGroupBtn = document.getElementById("createGroupBtn");
if (createGroupBtn) {
  createGroupBtn.addEventListener("click", async () => {
    const nameInput = document.getElementById("groupName");
    const groupName = nameInput.value.trim() || "割り勘グループ";
    const groupId = generateId();

    const groupRef = doc(db, "groups", groupId);
    await setDoc(groupRef, {
      name: groupName,
      createdAt: serverTimestamp(),
    });

    const base =
      location.origin + location.pathname.replace(/index\.html$/, "");
    const url = `${base}group.html?g=${groupId}`;

    // ローカルに履歴保存
    try {
      const HISTORY_KEY = "splitbill_group_history";
      const raw = localStorage.getItem(HISTORY_KEY) || "[]";
      const history = JSON.parse(raw);
      history.unshift({
        id: groupId,
        name: groupName,
        url,
        createdAt: Date.now(),
      });
      const limited = history.slice(0, 20); // 最大20件くらいに制限
      localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    } catch (_) {
      // localStorage が使えない場合は無視
    }

    const result = document.getElementById("result");
    result.textContent = `このURLを共有： ${url}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  });
}

// 「はじめる」ボタンで作成セクションへスムーズスクロール
const startBtn = document.getElementById("startBtn");
if (startBtn) {
  startBtn.onclick = () => {
    const sec = document.getElementById("createSection");
    sec?.scrollIntoView({ behavior: "smooth" });
  };
}

/* ========== group.html（支出一覧画面） ========== */

const expenseListOnGroup = document.getElementById("expenseList");
if (expenseListOnGroup) {
  const groupId = getGroupIdFromQuery();
  const groupTitleEl = document.getElementById("groupTitle");
  const emptyMessageEl = document.getElementById("emptyMessage");
  const copyLinkBtn = document.getElementById("copyLinkBtn");
  const goAddBtn = document.getElementById("goAddBtn");
  const goSettleBtn = document.getElementById("goSettleBtn");
  const searchInput = document.getElementById("searchInput");
  let allExpenses = [];

  if (!groupId) {
    if (groupTitleEl) groupTitleEl.textContent = "グループIDがありません";
  } else {
    const groupRef = doc(db, "groups", groupId);

    // グループ名
    (async () => {
      const snap = await getDoc(groupRef);
      if (snap.exists() && groupTitleEl) {
        groupTitleEl.textContent = snap.data().name || "SplitBill";
      }
    })();

    // リンクコピー
    if (copyLinkBtn) {
      copyLinkBtn.onclick = () => {
        const url = location.href;
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(url)
            .then(() => alert("リンクをコピーしました！"))
            .catch(() => alert("コピーに失敗しました"));
        } else {
          alert("クリップボードコピーに非対応のブラウザです");
        }
      };
    }

    // ページ遷移ボタン
    if (goAddBtn) {
      goAddBtn.onclick = () => {
        location.href = `add.html?g=${groupId}`;
      };
    }
    if (goSettleBtn) {
      goSettleBtn.onclick = () => {
        location.href = `settle.html?g=${groupId}`;
      };
    }

    const expensesRef = collection(groupRef, "expenses");

    // 支出一覧描画関数（検索対応）
    function renderExpenses(filterText, expenses, members) {
      expenseListOnGroup.innerHTML = "";
      const text = (filterText || "").toLowerCase();

      const filtered = expenses.filter((e) => {
        if (!text) return true;
        const title = (e.title || "").toLowerCase();
        return title.includes(text);
      });

      if (filtered.length === 0) {
        if (emptyMessageEl) emptyMessageEl.style.display = "block";
        return;
      } else {
        if (emptyMessageEl) emptyMessageEl.style.display = "none";
      }

      for (const e of filtered) {
        const li = document.createElement("li");
        li.className = "expense-card";

        const { icon, label } = getCategoryInfo(e.category);

        const iconSpan = document.createElement("span");
        iconSpan.className = "expense-icon";
        iconSpan.textContent = icon;

        const mainDiv = document.createElement("div");
        mainDiv.className = "expense-main";

        const titleRow = document.createElement("div");
        titleRow.className = "expense-title-row";

        const titleSpan = document.createElement("span");
        titleSpan.textContent = e.title || "支出";

        const amountSpan = document.createElement("span");
        amountSpan.className = "expense-amount";
        amountSpan.textContent = `${e.amount}円`;

        titleRow.appendChild(titleSpan);
        titleRow.appendChild(amountSpan);

        const meta = document.createElement("div");
        meta.className = "expense-meta";
        const payerName = members[e.payerId] || "不明";
        const count = (e.participantIds || []).length;
        meta.textContent = `${label}・${payerName}が支払い・${count}人分`;

        mainDiv.appendChild(titleRow);
        mainDiv.appendChild(meta);

        // 右側の編集・削除ボタン
        const actions = document.createElement("div");
        actions.className = "expense-actions";

        const editBtn = document.createElement("button");
        editBtn.textContent = "編集";
        editBtn.className = "secondary small";
        editBtn.onclick = () => {
          location.href = `edit.html?g=${groupId}&e=${e.id}`;
        };

        const delBtn = document.createElement("button");
        delBtn.textContent = "削除";
        delBtn.className = "secondary small";
        delBtn.onclick = async () => {
          if (!confirm(`${e.title} を削除しますか？`)) return;
          await deleteDoc(doc(expensesRef, e.id));
        };

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        li.appendChild(iconSpan);
        li.appendChild(mainDiv);
        li.appendChild(actions);

        expenseListOnGroup.appendChild(li);
      }
    }

    // 支出一覧＋カテゴリアイコン（リアルタイム）
    onSnapshot(expensesRef, async (snap) => {
      const expenses = [];
      snap.forEach((docSnap) => {
        const e = { id: docSnap.id, ...docSnap.data() };
        expenses.push(e);
      });

      // メンバー名（支払い者表示用）
      const membersSnap = await getDocs(collection(groupRef, "members"));
      const members = {};
      membersSnap.forEach((m) => {
        members[m.id] = m.data().name;
      });

      // createdAt 降順
      expenses.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });

      allExpenses = expenses;
      renderExpenses(searchInput?.value, allExpenses, members);

      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("input", () => {
          renderExpenses(searchInput.value, allExpenses, members);
        });
      }
    });
  }
}

/* ========== add.html（支出追加＋メンバー追加） ========== */

const addExpenseBtn = document.getElementById("addExpenseBtn");
if (addExpenseBtn) {
  const groupId = getGroupIdFromQuery();
  const groupTitleEl = document.getElementById("groupTitle");
  const backToGroupBtn = document.getElementById("backToGroupBtn");

  if (!groupId) {
    if (groupTitleEl) groupTitleEl.textContent = "グループIDがありません";
  } else {
    const groupRef = doc(db, "groups", groupId);
    const membersRef = collection(groupRef, "members");

    // タイトル
    (async () => {
      const snap = await getDoc(groupRef);
      if (snap.exists() && groupTitleEl) {
        groupTitleEl.textContent = `${snap.data().name} に支出を追加`;
      }
    })();

    if (backToGroupBtn) {
      backToGroupBtn.onclick = () => {
        location.href = `group.html?g=${groupId}`;
      };
    }

    const memberListEl = document.getElementById("memberList");
    const payerSelect = document.getElementById("payerSelect");
    const participantCheckboxes = document.getElementById("participantCheckboxes");
    const addMemberBtn = document.getElementById("addMemberBtn");
    const newMemberNameInput = document.getElementById("newMemberName");

    // メンバー追加（誰でも）
    addMemberBtn?.addEventListener("click", async () => {
      const name = newMemberNameInput.value.trim();
      if (!name) {
        alert("名前を入力してね");
        return;
      }
      const memberId = generateId();
      await setDoc(doc(membersRef, memberId), {
        name,
        createdAt: serverTimestamp(),
      });
      newMemberNameInput.value = "";
    });

    // メンバー一覧＋支払い者 select＋参加者チェックボックス
    if (memberListEl && payerSelect && participantCheckboxes) {
      onSnapshot(membersRef, (snap) => {
        memberListEl.innerHTML = "";
        payerSelect.innerHTML = "";
        participantCheckboxes.innerHTML = "";

        snap.forEach((docSnap) => {
          const m = { id: docSnap.id, ...docSnap.data() };

          // メンバーカード
          const li = document.createElement("li");
          li.className = "member-item";

          const nameSpan = document.createElement("span");
          nameSpan.textContent = m.name;

          const delBtn = document.createElement("button");
          delBtn.textContent = "削除";
          delBtn.className = "secondary small";
          delBtn.onclick = async () => {
            if (!confirm(`${m.name} をメンバーから削除しますか？`)) return;
            await deleteDoc(doc(membersRef, m.id));
          };

          li.appendChild(nameSpan);
          li.appendChild(delBtn);
          memberListEl.appendChild(li);

          // 支払い者 select
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.name;
          payerSelect.appendChild(opt);

          // 参加者 checkbox
          const label = document.createElement("label");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = m.id;
          cb.checked = true;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(m.name));
          participantCheckboxes.appendChild(label);
        });
      });
    }

    // 支出追加
    addExpenseBtn.addEventListener("click", async () => {
      const titleInput = document.getElementById("expenseTitle");
      const amountInput = document.getElementById("expenseAmount");
      const categorySelect = document.getElementById("categorySelect");

      const title = titleInput.value.trim() || "支出";
      const amount = Number(amountInput.value);
      const payerId = payerSelect.value;
      const category = categorySelect.value || "other";

      if (!amount || amount <= 0) {
        alert("金額を入力してね");
        return;
      }
      if (!payerId) {
        alert("支払った人を選んでね");
        return;
      }

      const participantIds = Array.from(
        participantCheckboxes.querySelectorAll("input[type=checkbox]:checked")
      ).map((cb) => cb.value);

      if (participantIds.length === 0) {
        alert("少なくとも1人は選んでね");
        return;
      }

      await addDoc(collection(groupRef, "expenses"), {
        title,
        amount,
        payerId,
        participantIds,
        category,
        createdAt: serverTimestamp(),
      });

      titleInput.value = "";
      amountInput.value = "";
      alert("支出を追加しました！");
    });
  }
}

/* ========== settle.html（精算画面） ========== */

const copyForLineBtn = document.getElementById("copyForLineBtn");
if (copyForLineBtn) {
  const groupId = getGroupIdFromQuery();
  const groupTitleEl = document.getElementById("groupTitle");
  const balancesEl = document.getElementById("balances");
  const transfersEl = document.getElementById("transfers");
  const backToGroupBtn = document.getElementById("backToGroupBtn");

  if (!groupId) {
    if (groupTitleEl) groupTitleEl.textContent = "グループIDがありません";
  } else {
    const groupRef = doc(db, "groups", groupId);

    (async () => {
      const snap = await getDoc(groupRef);
      if (snap.exists() && groupTitleEl) {
        groupTitleEl.textContent = `${snap.data().name} の精算`;
      }
    })();

    if (backToGroupBtn) {
      backToGroupBtn.onclick = () => {
        location.href = `group.html?g=${groupId}`;
      };
    }

    const expensesRef = collection(groupRef, "expenses");

    onSnapshot(expensesRef, async (snap) => {
      const expenses = [];
      snap.forEach((docSnap) => {
        expenses.push({ id: docSnap.id, ...docSnap.data() });
      });

      const memberSnap = await getDocs(collection(groupRef, "members"));
      const members = {};
      memberSnap.forEach((m) => {
        members[m.id] = m.data().name;
      });

      const net = {};
      Object.keys(members).forEach((id) => (net[id] = 0));

      for (const e of expenses) {
        if (!e.participantIds || e.participantIds.length === 0) continue;
        const share = e.amount / e.participantIds.length;

        if (net[e.payerId] === undefined) net[e.payerId] = 0;
        net[e.payerId] += e.amount;

        for (const pid of e.participantIds) {
          if (net[pid] === undefined) net[pid] = 0;
          net[pid] -= share;
        }
      }

      // 各自の残高
      balancesEl.innerHTML = "";
      const ulB = document.createElement("ul");
      for (const id in net) {
        const li = document.createElement("li");
        const yen = Math.round(net[id]);
        const name = members[id] || "(不明)";
        if (yen > 0) {
          li.textContent = `${name}： +${yen}円（受け取る）`;
        } else if (yen < 0) {
          li.textContent = `${name}： ${yen}円（支払う）`;
        } else {
          li.textContent = `${name}： 0円`;
        }
        ulB.appendChild(li);
      }
      balancesEl.appendChild(ulB);

      // 支払い組み合わせ
      const creditors = [];
      const debtors = [];
      for (const id in net) {
        const yen = Math.round(net[id]);
        if (yen > 0) creditors.push({ id, amount: yen });
        if (yen < 0) debtors.push({ id, amount: yen });
      }
      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => a.amount - b.amount);

      const transferList = [];
      let i = 0,
        j = 0;
      while (i < debtors.length && j < creditors.length) {
        const d = debtors[i];
        const c = creditors[j];
        const pay = Math.min(-d.amount, c.amount);
        transferList.push({
          from: d.id,
          to: c.id,
          amount: pay,
        });
        d.amount += pay;
        c.amount -= pay;
        if (d.amount === 0) i++;
        if (c.amount === 0) j++;
      }

      transfersEl.innerHTML = "";
      const ulT = document.createElement("ul");
      if (transferList.length === 0) {
        const li = document.createElement("li");
        li.textContent = "すでに精算済みです 🎉";
        ulT.appendChild(li);
      } else {
        for (const t of transferList) {
          const li = document.createElement("li");
          const fromName = members[t.from] || "(不明)";
          const toName = members[t.to] || "(不明)";
          li.textContent = `${fromName} → ${toName}：${t.amount}円`;
          ulT.appendChild(li);
        }
      }
      transfersEl.appendChild(ulT);

      // LINE用テキスト
      copyForLineBtn.onclick = () => {
        let text = `【割り勘結果】\n\n`;
        text += `▼各自の残高\n`;
        for (const id in net) {
          const yen = Math.round(net[id]);
          const name = members[id] || "(不明)";
          if (yen > 0) text += `${name}：+${yen}円（受け取り）\n`;
          else if (yen < 0) text += `${name}：${yen}円（支払い）\n`;
          else text += `${name}：0円\n`;
        }
        text += `\n▼支払い組み合わせ\n`;
        if (transferList.length === 0) {
          text += `精算はすでに完了しています 🎉\n`;
        } else {
          for (const t of transferList) {
            const fromName = members[t.from] || "(不明)";
            const toName = members[t.to] || "(不明)";
            text += `${fromName} → ${toName}：${t.amount}円\n`;
          }
        }

        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(text)
            .then(() => alert("コピーしました！LINEに貼り付けてね"))
            .catch(() => alert("コピーに失敗しました"));
        } else {
          alert("クリップボードコピーに非対応のブラウザです");
        }
      };
    });
  }
}

/* ========== edit.html（支出編集） ========== */

const saveEditBtn = document.getElementById("saveEditBtn");
if (saveEditBtn) {
  const params = new URLSearchParams(location.search);
  const groupId = params.get("g");
  const expenseId = params.get("e");
  const backBtn = document.getElementById("backToGroupBtn");

  if (backBtn && groupId) {
    backBtn.onclick = () => {
      location.href = `group.html?g=${groupId}`;
    };
  }

  if (!groupId || !expenseId) {
    alert("URL が不正です");
  } else {
    const groupRef = doc(db, "groups", groupId);
    const expenseRef = doc(groupRef, "expenses", expenseId);

    const titleInput = document.getElementById("editExpenseTitle");
    const amountInput = document.getElementById("editExpenseAmount");
    const categorySelect = document.getElementById("editCategorySelect");
    const payerSelect = document.getElementById("editPayerSelect");
    const participantBox = document.getElementById("editParticipantCheckboxes");

    // メンバー一覧取得
    (async () => {
      const memberSnap = await getDocs(collection(groupRef, "members"));
      memberSnap.forEach((m) => {
        const id = m.id;
        const name = m.data().name;

        // 支払い者 select
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        payerSelect.appendChild(opt);

        // 参加者チェックボックス
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = id;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        participantBox.appendChild(label);
      });

      // 既存支出読み込み
      const snap = await getDoc(expenseRef);
      if (!snap.exists()) {
        alert("支出が見つかりません");
        return;
      }
      const data = snap.data();
      titleInput.value = data.title || "";
      amountInput.value = data.amount || "";
      categorySelect.value = data.category || "other";
      payerSelect.value = data.payerId;

      const participants = new Set(data.participantIds || []);
      participantBox.querySelectorAll("input[type=checkbox]").forEach((cb) => {
        if (participants.has(cb.value)) cb.checked = true;
      });
    })();

    // 保存
    saveEditBtn.onclick = async () => {
      const title = titleInput.value.trim() || "支出";
      const amount = Number(amountInput.value);
      const category = categorySelect.value || "other";
      const payerId = payerSelect.value;

      const participantIds = Array.from(
        participantBox.querySelectorAll("input[type=checkbox]:checked")
      ).map((cb) => cb.value);

      if (!amount || amount <= 0) {
        alert("金額を入力してね");
        return;
      }
      if (!payerId) {
        alert("支払った人を選んでね");
        return;
      }
      if (participantIds.length === 0) {
        alert("少なくとも1人は選んでね");
        return;
      }

      await updateDoc(expenseRef, {
        title,
        amount,
        category,
        payerId,
        participantIds,
      });

      alert("更新しました！");
      location.href = `group.html?g=${groupId}`;
    };
  }
}