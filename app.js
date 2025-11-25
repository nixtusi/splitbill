// app.js

import { db, serverTimestamp } from "./firebase-config.js";
import {
  collection, doc, setDoc, addDoc, getDoc, getDocs,
  onSnapshot, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* --- 共通ユーティリティ --- */

// トースト表示 (type: 'success' | 'error')
function showToast(msg, type = 'success') {
  const div = document.createElement('div');
  div.className = `toast ${type} show`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ランダムID生成
function generateId(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// URLパラメータ取得
function getGroupId() {
  return new URLSearchParams(location.search).get("g");
}
function getExpenseId() {
  return new URLSearchParams(location.search).get("e");
}

// クリップボードコピー (シンプル版)
async function copyToClipboard(text, successMsg = "コピーしました！") {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch (e) {
      prompt("コピーしてください:", text);
    }
  } else {
    prompt("コピーしてください:", text);
  }
}

// カテゴリ定義
const CATEGORIES = [
  { value: "food", label: "飲食", icon: "🍚" },
  { value: "alcohol", label: "飲み会", icon: "🍻" },
  { value: "transport", label: "交通", icon: "🚗" },
  { value: "lodging", label: "宿泊", icon: "🏨" },
  { value: "activity", label: "遊び", icon: "🎡" },
  { value: "shopping", label: "買い物", icon: "🛒" },
  { value: "other", label: "その他", icon: "💰" }
];

function getCategoryInfo(val) {
  return CATEGORIES.find(c => c.value === val) || CATEGORIES[CATEGORIES.length - 1];
}

/* --- ページ別ロジック --- */

// ■ index.html (LP)
const startBtn = document.getElementById("startBtn");
if (startBtn) {
  startBtn.onclick = () => {
    location.href = "create.html";
  };
  
  // 履歴表示
  const historyList = document.getElementById("groupHistoryList");
  if (historyList) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem("teampay_history") || "[]");
    } catch (_) {}

    if (history.length > 0) {
      historyList.innerHTML = "";
      history.forEach(h => {
        const li = document.createElement("li");
        li.className = "group-history-item";
        li.innerHTML = `<a href="group.html?g=${h.id}"><b>${h.name}</b></a>`;
        historyList.appendChild(li);
      });
      document.getElementById("noHistoryMsg").style.display = "none";
    }
  }
}

// ■ create.html (グループ作成)
const createFinalBtn = document.getElementById("createFinalBtn");
if (createFinalBtn) {
  const tempMembers = [];
  const tempUl = document.getElementById("tempMemberList");
  const addMemBtn = document.getElementById("addTempMemberBtn");
  const memInput = document.getElementById("newMemberName");

  function renderTemp() {
    tempUl.innerHTML = "";
    tempMembers.forEach((name, i) => {
      const li = document.createElement("li");
      li.className = "member-item";
      li.innerHTML = `<span>${name}</span><button class="secondary small" data-idx="${i}">削除</button>`;
      tempUl.appendChild(li);
    });
    tempUl.querySelectorAll("button").forEach(b => {
      b.onclick = (e) => {
        tempMembers.splice(e.target.dataset.idx, 1);
        renderTemp();
      };
    });
  }

  addMemBtn.onclick = () => {
    const name = memInput.value.trim();
    if (!name) return showToast("名前を入力してください", "error");
    if (tempMembers.includes(name)) return showToast("同じ名前の人がいます", "error");
    tempMembers.push(name);
    memInput.value = "";
    renderTemp();
  };

  createFinalBtn.onclick = async () => {
    const groupName = document.getElementById("newGroupName").value.trim();
    if (!groupName) return showToast("グループ名を入力してください", "error");
    if (tempMembers.length === 0) return showToast("メンバーを1人以上追加してください", "error");

    const gid = generateId();
    const groupRef = doc(db, "groups", gid);
    
    // デフォルト通貨設定 (JPY, レート1)
    await setDoc(groupRef, {
      name: groupName,
      createdAt: serverTimestamp(),
      currencies: { "JPY": 1 } // ベース通貨
    });

    const memRef = collection(groupRef, "members");
    for (const name of tempMembers) {
      await setDoc(doc(memRef, generateId()), { name, createdAt: serverTimestamp() });
    }

    // 履歴保存
    try {
      const hist = JSON.parse(localStorage.getItem("teampay_history") || "[]");
      hist.unshift({ id: gid, name: groupName });
      localStorage.setItem("teampay_history", JSON.stringify(hist.slice(0, 10)));
    } catch (_) {}

    location.href = `created.html?g=${gid}`;
  };
}

// ■ created.html
const createdUrlEl = document.getElementById("createdGroupUrl");
if (createdUrlEl) {
  const gid = getGroupId();
  const url = `${location.origin}${location.pathname.replace("created.html", "group.html")}?g=${gid}`;
  createdUrlEl.textContent = url;
  document.getElementById("copyUrlBtn").onclick = () => copyToClipboard(url);
  document.getElementById("goGroupBtn").onclick = () => location.href = url;
}

// ■ group.html (ダッシュボード)
const groupTitleEl = document.getElementById("groupTitle");
if (groupTitleEl && document.getElementById("expenseList")) {
  const gid = getGroupId();
  if (!gid) location.href = "index.html";

  // 設定ボタンへ遷移
  document.getElementById("settingsBtn").onclick = () => location.href = `settings.html?g=${gid}`;
  document.getElementById("goAddBtn").onclick = () => location.href = `add.html?g=${gid}`;
  document.getElementById("goSettleBtn").onclick = () => location.href = `settle.html?g=${gid}`;

  // グループ情報購読
  onSnapshot(doc(db, "groups", gid), (docSnap) => {
    if (docSnap.exists()) {
      groupTitleEl.textContent = docSnap.data().name;
    }
  });

  // メンバー情報取得
  let membersMap = {};
  getDocs(collection(doc(db, "groups", gid), "members")).then(snap => {
    snap.forEach(d => membersMap[d.id] = d.data().name);
  });

  // 支出一覧購読
  onSnapshot(collection(doc(db, "groups", gid), "expenses"), (snap) => {
    const list = document.getElementById("expenseList");
    const expenses = [];
    snap.forEach(d => expenses.push({ id: d.id, ...d.data() }));

    // 日付順、作成日順にソート
    expenses.sort((a, b) => {
      if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    list.innerHTML = "";
    if (expenses.length === 0) {
      document.getElementById("emptyMessage").style.display = "block";
    } else {
      document.getElementById("emptyMessage").style.display = "none";
      expenses.forEach(e => {
        const li = document.createElement("li");
        li.className = "expense-card";
        li.onclick = () => location.href = `edit.html?g=${gid}&e=${e.id}`;
        
        const cat = getCategoryInfo(e.category);
        const payer = membersMap[e.payerId] || "不明";
        
        // 通貨表示 (ベース通貨換算があればそちらを表示、なければ元の通貨)
        const displayAmount = e.currency && e.currency !== 'JPY' 
          ? `${e.originalAmount}${e.currency} (${Math.round(e.amount).toLocaleString()}円)`
          : `${Math.round(e.amount).toLocaleString()}円`;

        li.innerHTML = `
          <div class="expense-icon">${cat.icon}</div>
          <div class="expense-main">
            <div class="expense-top">
              <span>${e.title}</span>
              <span>${displayAmount}</span>
            </div>
            <div class="expense-meta">
              <span class="expense-date">${e.date || ""}</span>
              ${payer}が支払い • ${e.participantIds.length}人分
            </div>
          </div>
        `;
        list.appendChild(li);
      });
    }
    document.getElementById("loadingMsg").style.display = "none";
  });
}

// ■ add.html / edit.html (共通処理が多いのでまとめる)
const isEdit = document.body.dataset.page === "edit";
const saveBtn = document.getElementById(isEdit ? "saveEditBtn" : "addExpenseBtn");

if (saveBtn) {
  const gid = getGroupId();
  const eid = getExpenseId();
  const groupRef = doc(db, "groups", gid);
  
  // UI要素
  const titleInput = document.getElementById(isEdit ? "editExpenseTitle" : "expenseTitle");
  const amountInput = document.getElementById(isEdit ? "editExpenseAmount" : "expenseAmount");
  const dateInput = document.getElementById("expenseDate");
  const catSelect = document.getElementById(isEdit ? "editCategorySelect" : "categorySelect");
  const payerSelect = document.getElementById(isEdit ? "editPayerSelect" : "payerSelect");
  const currencySelect = document.getElementById("currencySelect");
  const chipContainer = document.getElementById(isEdit ? "editParticipantCheckboxes" : "participantCheckboxes");
  const selectAllBtn = document.getElementById("selectAllBtn");

  // デフォルト日付（今日）
  if (!isEdit && dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // カテゴリ生成
  catSelect.innerHTML = "";
  CATEGORIES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.value;
    opt.textContent = c.icon + " " + c.label;
    catSelect.appendChild(opt);
  });

  // 初期データロード（グループ通貨設定、メンバー、(編集時)既存データ）
  Promise.all([
    getDoc(groupRef),
    getDocs(collection(groupRef, "members")),
    isEdit ? getDoc(doc(groupRef, "expenses", eid)) : Promise.resolve(null)
  ]).then(([gSnap, mSnap, eSnap]) => {
    const gData = gSnap.data();
    const currencies = gData.currencies || { "JPY": 1 };

    // 通貨セレクト生成
    currencySelect.innerHTML = "";
    Object.keys(currencies).forEach(code => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      opt.dataset.rate = currencies[code];
      currencySelect.appendChild(opt);
    });

    // メンバー生成
    payerSelect.innerHTML = "";
    chipContainer.innerHTML = "";
    const allMemberIds = [];
    mSnap.forEach(m => {
      const id = m.id;
      const name = m.data().name;
      allMemberIds.push(id);

      // 支払い者
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      payerSelect.appendChild(opt);

      // 参加者チップ
      const label = document.createElement("label");
      label.className = "chip-label";
      label.innerHTML = `<input type="checkbox" value="${id}" checked> ${name}`;
      chipContainer.appendChild(label);
    });

    // 全員選択ボタン
    selectAllBtn.onclick = () => {
      const cbs = chipContainer.querySelectorAll("input");
      // 全員チェック済みなら全部外す、そうでなければ全部つける
      const allChecked = Array.from(cbs).every(c => c.checked);
      cbs.forEach(c => c.checked = !allChecked);
    };

    // 編集時の値セット
    if (isEdit && eSnap.exists()) {
      const d = eSnap.data();
      titleInput.value = d.title;
      // 元通貨の金額があればそれを、なければ保存されている金額(JPY)を
      amountInput.value = d.originalAmount || d.amount; 
      dateInput.value = d.date || "";
      catSelect.value = d.category;
      payerSelect.value = d.payerId;
      if (d.currency) currencySelect.value = d.currency;

      const pSet = new Set(d.participantIds);
      chipContainer.querySelectorAll("input").forEach(cb => {
        cb.checked = pSet.has(cb.value);
      });
    }
  });

  // 保存処理
  saveBtn.onclick = async () => {
    const title = titleInput.value.trim();
    const rawAmount = parseFloat(amountInput.value);
    const payerId = payerSelect.value;
    const currency = currencySelect.value;
    const rate = parseFloat(currencySelect.options[currencySelect.selectedIndex].dataset.rate);
    const pIds = Array.from(chipContainer.querySelectorAll("input:checked")).map(c => c.value);
    const dateVal = dateInput.value;

    // バリデーション
    if (!title) return showToast("タイトルを入力してください", "error");
    if (!rawAmount || rawAmount <= 0) return showToast("金額を正しく入力してください", "error");
    if (!payerId) return showToast("支払った人を選択してください", "error");
    if (pIds.length === 0) return showToast("誰の分か（参加者）を選択してください", "error");
    if (!dateVal) return showToast("日付を選択してください", "error");

    // ベース通貨(JPY)への換算
    const amountInBase = rawAmount * rate;

    const data = {
      title,
      amount: amountInBase, // 集計用
      originalAmount: rawAmount, // 表示用
      currency,
      rate, // その時のレートを保存
      category: catSelect.value,
      payerId,
      participantIds: pIds,
      date: dateVal,
      updatedAt: serverTimestamp()
    };

    if (!isEdit) data.createdAt = serverTimestamp();

    try {
      if (isEdit) {
        await updateDoc(doc(groupRef, "expenses", eid), data);
        showToast("更新しました！");
      } else {
        await addDoc(collection(groupRef, "expenses"), data);
        showToast("追加しました！");
      }
      setTimeout(() => location.href = `group.html?g=${gid}`, 500);
    } catch (e) {
      showToast("エラーが発生しました", "error");
    }
  };

  // 削除（編集時のみ）
  const delBtn = document.getElementById("deleteExpenseBtn");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm("本当に削除しますか？")) {
        await deleteDoc(doc(groupRef, "expenses", eid));
        location.href = `group.html?g=${gid}`;
      }
    };
  }
  
  // 戻るボタン
  document.getElementById("backToGroupBtn").onclick = () => location.href = `group.html?g=${gid}`;
}

// ■ settle.html (精算＆支出タブ)
const settleBody = document.body.dataset.page === "settle";
if (settleBody) {
  const gid = getGroupId();
  const groupRef = doc(db, "groups", gid);
  
  // タブ切り替え
  const tabPay = document.getElementById("tabPayment");
  const tabSpend = document.getElementById("tabSpending");
  const sectionPay = document.getElementById("sectionPayment");
  const sectionSpend = document.getElementById("sectionSpending");

  tabPay.onclick = () => {
    tabPay.classList.add("active");
    tabSpend.classList.remove("active");
    sectionPay.style.display = "block";
    sectionSpend.style.display = "none";
  };
  tabSpend.onclick = () => {
    tabSpend.classList.add("active");
    tabPay.classList.remove("active");
    sectionPay.style.display = "none";
    sectionSpend.style.display = "block";
  };

  document.getElementById("backToGroupBtn").onclick = () => location.href = `group.html?g=${gid}`;

  // 計算ロジック
  Promise.all([
    getDocs(collection(groupRef, "members")),
    getDocs(collection(groupRef, "expenses"))
  ]).then(([mSnap, eSnap]) => {
    const members = {};
    mSnap.forEach(m => members[m.id] = m.data().name);

    const net = {}; // 精算用バランス
    const spending = {}; // 個人の支出合計（自分が消費した分）
    Object.keys(members).forEach(id => {
      net[id] = 0;
      spending[id] = 0;
    });

    eSnap.forEach(docSnap => {
      const e = docSnap.data();
      if (!e.participantIds || e.participantIds.length === 0) return;
      
      const share = e.amount / e.participantIds.length;

      // 立て替え払いへの加算
      if (net[e.payerId] !== undefined) net[e.payerId] += e.amount;

      // 参加者の消費加算 & 負債加算
      e.participantIds.forEach(pid => {
        if (members[pid]) {
          spending[pid] += share;
          net[pid] -= share;
        }
      });
    });

    // --- 支出タブ表示 ---
    const spendList = document.getElementById("spendingList");
    let totalEventCost = 0;
    Object.entries(spending).sort((a, b) => b[1] - a[1]).forEach(([id, amount]) => {
      const li = document.createElement("li");
      li.className = "expense-card"; // スタイル流用
      li.style.cursor = "default";
      li.innerHTML = `
        <div class="expense-main">
          <div class="expense-top">
            <span>${members[id]}</span>
            <span>${Math.round(amount).toLocaleString()}円</span>
          </div>
        </div>
      `;
      spendList.appendChild(li);
      totalEventCost += amount;
    });
    // 合計表示
    const totalDiv = document.createElement("div");
    totalDiv.style.textAlign = "right";
    totalDiv.style.fontWeight = "bold";
    totalDiv.style.marginTop = "10px";
    totalDiv.textContent = `合計: ${Math.round(totalEventCost).toLocaleString()}円`;
    sectionSpend.appendChild(totalDiv);


    // --- 支払いタブ（精算）表示 ---
    const transferDiv = document.getElementById("transfers");
    const creditors = [];
    const debtors = [];

    Object.entries(net).forEach(([id, val]) => {
      const v = Math.round(val);
      if (v > 0) creditors.push({ id, amount: v });
      if (v < 0) debtors.push({ id, amount: v }); // 負の値
    });

    creditors.sort((a, b) => b.amount - a.amount); // 受け取り多い順
    debtors.sort((a, b) => a.amount - b.amount);   // 支払い多い順（マイナスの絶対値が大きい順）

    const transfers = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const pay = Math.min(-d.amount, c.amount); // 返せる額か、受け取る額の小さい方

      if (pay > 0) {
        transfers.push({ from: d.id, to: c.id, amount: pay });
      }

      d.amount += pay;
      c.amount -= pay;

      if (Math.abs(d.amount) < 1) i++;
      if (c.amount < 1) j++;
    }

    transferDiv.innerHTML = "";
    let copyText = "【Team Pay 精算リスト】\n\n";

    if (transfers.length === 0) {
      transferDiv.innerHTML = "<p class='muted'>精算の必要はありません 🎉</p>";
      copyText += "精算済みです！";
    } else {
      const ul = document.createElement("ul");
      transfers.forEach(t => {
        const li = document.createElement("li");
        li.className = "expense-card";
        li.style.cursor = "default";
        li.innerHTML = `
          <div class="expense-main">
            <div class="expense-top">
              <span>${members[t.from]} <span style="font-size:12px; color:#666;">→</span> ${members[t.to]}</span>
              <span class="text-red">${t.amount.toLocaleString()}円</span>
            </div>
            <div class="expense-meta">支払ってください</div>
          </div>
        `;
        ul.appendChild(li);
        copyText += `${members[t.from]} → ${members[t.to]}： ${t.amount.toLocaleString()}円\n`;
      });
      transferDiv.appendChild(ul);
    }

    // メッセージ共有
    document.getElementById("copyForLineBtn").onclick = () => copyToClipboard(copyText, "精算結果をコピーしました！");
  });
}

// ■ settings.html (設定画面)
const settingsBody = document.body.dataset.page === "settings";
if (settingsBody) {
  const gid = getGroupId();
  const groupRef = doc(db, "groups", gid);

  document.getElementById("backToGroupBtn").onclick = () => location.href = `group.html?g=${gid}`;

  // 初期ロード
  getDoc(groupRef).then(snap => {
    const data = snap.data();
    document.getElementById("groupNameInput").value = data.name;
    
    // 通貨リスト
    renderCurrencies(data.currencies || { "JPY": 1 });
  });

  // グループ名変更
  document.getElementById("updateGroupNameBtn").onclick = async () => {
    const newName = document.getElementById("groupNameInput").value.trim();
    if (!newName) return showToast("グループ名を入力してください", "error");
    await updateDoc(groupRef, { name: newName });
    showToast("グループ名を更新しました");
  };

  // 招待リンクコピー
  document.getElementById("copyInviteLinkBtn").onclick = () => {
    const url = `${location.origin}${location.pathname.replace("settings.html", "group.html")}?g=${gid}`;
    copyToClipboard(url, "招待リンクをコピーしました");
  };

  // メンバー編集エリア
  const memList = document.getElementById("settingsMemberList");
  function loadMembers() {
    memList.innerHTML = "";
    getDocs(collection(groupRef, "members")).then(snap => {
      snap.forEach(d => {
        const li = document.createElement("li");
        li.className = "member-item";
        li.innerHTML = `
          <input type="text" value="${d.data().name}" id="mem-${d.id}">
          <button class="secondary small" onclick="updateMember('${d.id}')">更新</button>
        `;
        memList.appendChild(li);
      });
    });
  }
  loadMembers();

  window.updateMember = async (mid) => {
    const newName = document.getElementById(`mem-${mid}`).value.trim();
    if (!newName) return showToast("名前を入力してください", "error");
    await updateDoc(doc(groupRef, "members", mid), { name: newName });
    showToast("メンバー名を更新しました");
  };

  document.getElementById("addNewMemberBtn").onclick = async () => {
    const name = document.getElementById("addMemberInput").value.trim();
    if (!name) return showToast("名前を入力してください", "error");
    await setDoc(doc(groupRef, "members", generateId()), { name, createdAt: serverTimestamp() });
    document.getElementById("addMemberInput").value = "";
    loadMembers();
    showToast("メンバーを追加しました");
  };

  // 通貨編集エリア
  const currencyList = document.getElementById("currencyList");
  
  function renderCurrencies(currencies) {
    currencyList.innerHTML = "";
    Object.entries(currencies).forEach(([code, rate]) => {
      const li = document.createElement("li");
      li.className = "member-item"; // スタイル流用
      if (code === 'JPY') {
        li.innerHTML = `<span>🇯🇵 JPY (基準)</span><span>1.0</span>`;
      } else {
        li.innerHTML = `
          <span>${code}</span>
          <div style="display:flex; gap:4px; align-items:center;">
            1 ${code} = <input type="number" value="${rate}" style="width:70px; margin:0;" id="rate-${code}"> 円
            <button class="secondary small" onclick="updateRate('${code}')">変更</button>
          </div>
        `;
      }
      currencyList.appendChild(li);
    });
  }

  window.updateRate = async (code) => {
    const newRate = parseFloat(document.getElementById(`rate-${code}`).value);
    if (!newRate || newRate <= 0) return showToast("正しいレートを入力してください", "error");
    
    // Firestoreから最新を取得して更新
    const snap = await getDoc(groupRef);
    const curs = snap.data().currencies;
    curs[code] = newRate;
    await updateDoc(groupRef, { currencies: curs });
    showToast(`${code}のレートを更新しました`);
    renderCurrencies(curs);
  };

  document.getElementById("addCurrencyBtn").onclick = async () => {
    const code = document.getElementById("newCurrencyCode").value.trim().toUpperCase();
    const rate = parseFloat(document.getElementById("newCurrencyRate").value);
    if (!code || !rate) return showToast("通貨コードとレートを入力してください", "error");
    if (code === 'JPY') return showToast("JPYは基準通貨です", "error");

    const snap = await getDoc(groupRef);
    const curs = snap.data().currencies || {};
    curs[code] = rate;
    await updateDoc(groupRef, { currencies: curs });
    
    document.getElementById("newCurrencyCode").value = "";
    document.getElementById("newCurrencyRate").value = "";
    showToast("通貨を追加しました");
    renderCurrencies(curs);
  };
}