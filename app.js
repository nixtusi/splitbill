// app.js

import { db, serverTimestamp } from "./firebase-config.js";
import {
  collection, doc, setDoc, addDoc, getDoc, getDocs,
  onSnapshot, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* --- 共通ユーティリティ --- */

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

function generateId(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function getGroupId() {
  return new URLSearchParams(location.search).get("g");
}
function getExpenseId() {
  return new URLSearchParams(location.search).get("e");
}

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

// ■ index.html (トップ)
const startBtn = document.getElementById("startBtn");
if (startBtn) {
  startBtn.onclick = () => location.href = "create.html";
  
  // 履歴表示（カードスタイル）
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
        li.className = "card-item clickable";
        li.onclick = () => location.href = `group.html?g=${h.id}`;
        
        li.innerHTML = `
          <div class="card-icon">📂</div>
          <div class="card-main">
            <div class="card-top">
              <span>${h.name}</span>
            </div>
            <div class="card-meta">ID: ${h.id}</div>
          </div>
        `;
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
      li.className = "member-card"; // カードスタイル流用
      li.style.padding = "8px 12px";
      li.innerHTML = `
        <span>${name}</span>
        <button class="secondary small" data-idx="${i}">削除</button>
      `;
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
    
    await setDoc(groupRef, {
      name: groupName,
      createdAt: serverTimestamp(),
      currencies: { "JPY": 1 }
    });

    const memRef = collection(groupRef, "members");
    for (const name of tempMembers) {
      await setDoc(doc(memRef, generateId()), { name, createdAt: serverTimestamp() });
    }

    try {
      const hist = JSON.parse(localStorage.getItem("teampay_history") || "[]");
      // 重複排除
      const newHist = [{ id: gid, name: groupName }, ...hist.filter(h => h.id !== gid)];
      localStorage.setItem("teampay_history", JSON.stringify(newHist.slice(0, 10)));
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
const expenseListEl = document.getElementById("expenseList");
if (expenseListEl) {
  const gid = getGroupId();
  if (!gid) location.href = "index.html";

  const groupTitleEl = document.getElementById("groupTitle");
  const searchInput = document.getElementById("searchInput");
  let allExpenses = [];
  let membersMap = {};

  // 遷移ボタン
  document.getElementById("settingsBtn").onclick = () => location.href = `settings.html?g=${gid}`;
  document.getElementById("goAddBtn").onclick = () => location.href = `add.html?g=${gid}`;
  document.getElementById("goSettleBtn").onclick = () => location.href = `settle.html?g=${gid}`;

  // グループ名
  onSnapshot(doc(db, "groups", gid), (docSnap) => {
    if (docSnap.exists()) groupTitleEl.textContent = docSnap.data().name;
  });

  // メンバー
  onSnapshot(collection(doc(db, "groups", gid), "members"), (snap) => {
    membersMap = {};
    snap.forEach(d => membersMap[d.id] = d.data().name);
    renderExpenses(); // メンバー名更新のため再描画
  });

  // 支出一覧
  onSnapshot(collection(doc(db, "groups", gid), "expenses"), (snap) => {
    allExpenses = [];
    snap.forEach(d => allExpenses.push({ id: d.id, ...d.data() }));
    
    // 日付順、作成順
    allExpenses.sort((a, b) => {
      if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    renderExpenses();
    document.getElementById("loadingMsg").style.display = "none";
  });

  // 描画関数 (検索対応)
  function renderExpenses() {
    const filterText = (searchInput.value || "").toLowerCase();
    const filtered = allExpenses.filter(e => 
      (e.title || "").toLowerCase().includes(filterText)
    );

    expenseListEl.innerHTML = "";
    
    if (filtered.length === 0) {
      document.getElementById("emptyMessage").style.display = "block";
    } else {
      document.getElementById("emptyMessage").style.display = "none";
      filtered.forEach(e => {
        const li = document.createElement("li");
        li.className = "card-item clickable";
        li.onclick = () => location.href = `edit.html?g=${gid}&e=${e.id}`;
        
        const cat = getCategoryInfo(e.category);
        const payer = membersMap[e.payerId] || "不明";
        const amountStr = e.currency && e.currency !== 'JPY' 
          ? `${e.originalAmount}${e.currency} (${Math.round(e.amount).toLocaleString()}円)`
          : `${Math.round(e.amount).toLocaleString()}円`;

        li.innerHTML = `
          <div class="card-icon">${cat.icon}</div>
          <div class="card-main">
            <div class="card-top">
              <span>${e.title}</span>
              <span>${amountStr}</span>
            </div>
            <div class="card-meta">
              <span class="expense-date">${e.date || ""}</span>
              ${payer} が立替 • ${e.participantIds.length}人
            </div>
          </div>
        `;
        expenseListEl.appendChild(li);
      });
    }
  }

  // 検索イベント
  if (searchInput) {
    searchInput.addEventListener("input", renderExpenses);
  }
}

// ■ add.html / edit.html
const isEdit = document.body.dataset.page === "edit";
const saveBtn = document.getElementById(isEdit ? "saveEditBtn" : "addExpenseBtn");

if (saveBtn) {
  const gid = getGroupId();
  const eid = getExpenseId();
  const groupRef = doc(db, "groups", gid);
  
  // 要素取得
  const titleInput = document.getElementById(isEdit ? "editExpenseTitle" : "expenseTitle");
  const amountInput = document.getElementById(isEdit ? "editExpenseAmount" : "expenseAmount");
  const dateInput = document.getElementById("expenseDate");
  const catSelect = document.getElementById(isEdit ? "editCategorySelect" : "categorySelect");
  const payerSelect = document.getElementById(isEdit ? "editPayerSelect" : "payerSelect");
  const currencySelect = document.getElementById("currencySelect");
  const chipContainer = document.getElementById(isEdit ? "editParticipantCheckboxes" : "participantCheckboxes");
  const selectAllBtn = document.getElementById("selectAllBtn");

  if (!isEdit && dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  catSelect.innerHTML = "";
  CATEGORIES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.value;
    opt.textContent = c.icon + " " + c.label;
    catSelect.appendChild(opt);
  });

  Promise.all([
    getDoc(groupRef),
    getDocs(collection(groupRef, "members")),
    isEdit ? getDoc(doc(groupRef, "expenses", eid)) : Promise.resolve(null)
  ]).then(([gSnap, mSnap, eSnap]) => {
    const gData = gSnap.data();
    const currencies = gData.currencies || { "JPY": 1 };

    currencySelect.innerHTML = "";
    Object.keys(currencies).forEach(code => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      opt.dataset.rate = currencies[code];
      currencySelect.appendChild(opt);
    });

    payerSelect.innerHTML = "";
    chipContainer.innerHTML = "";
    mSnap.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.data().name;
      payerSelect.appendChild(opt);

      const label = document.createElement("label");
      label.className = "chip-label";
      label.innerHTML = `<input type="checkbox" value="${m.id}" checked> ${m.data().name}`;
      chipContainer.appendChild(label);
    });

    selectAllBtn.onclick = () => {
      const cbs = chipContainer.querySelectorAll("input");
      const allChecked = Array.from(cbs).every(c => c.checked);
      cbs.forEach(c => c.checked = !allChecked);
    };

    if (isEdit && eSnap.exists()) {
      const d = eSnap.data();
      titleInput.value = d.title;
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

  saveBtn.onclick = async () => {
    const title = titleInput.value.trim();
    const rawAmount = parseFloat(amountInput.value);
    const payerId = payerSelect.value;
    const currency = currencySelect.value;
    const rate = parseFloat(currencySelect.options[currencySelect.selectedIndex].dataset.rate);
    const pIds = Array.from(chipContainer.querySelectorAll("input:checked")).map(c => c.value);
    const dateVal = dateInput.value;

    if (!title) return showToast("タイトルを入力してください", "error");
    if (isNaN(rawAmount) || rawAmount <= 0) return showToast("金額を入力してください", "error");
    if (!payerId) return showToast("支払った人を選択してください", "error");
    if (pIds.length === 0) return showToast("参加者を選択してください", "error");
    if (!dateVal) return showToast("日付を選択してください", "error");

    const amountInBase = rawAmount * rate;

    const data = {
      title,
      amount: amountInBase,
      originalAmount: rawAmount,
      currency,
      rate,
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

  if (isEdit) {
    document.getElementById("deleteExpenseBtn").onclick = async () => {
      if (confirm("本当に削除しますか？")) {
        await deleteDoc(doc(groupRef, "expenses", eid));
        location.href = `group.html?g=${gid}`;
      }
    };
  }
  document.getElementById("backToGroupBtn").onclick = () => location.href = `group.html?g=${gid}`;
}

// ■ settle.html (精算)
const settleBody = document.body.dataset.page === "settle";
if (settleBody) {
  const gid = getGroupId();
  const groupRef = doc(db, "groups", gid);
  
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

  Promise.all([
    getDocs(collection(groupRef, "members")),
    getDocs(collection(groupRef, "expenses"))
  ]).then(([mSnap, eSnap]) => {
    const members = {};
    mSnap.forEach(m => members[m.id] = m.data().name);

    const net = {}; 
    const spending = {}; 
    Object.keys(members).forEach(id => {
      net[id] = 0;
      spending[id] = 0;
    });

    eSnap.forEach(docSnap => {
      const e = docSnap.data();
      if (!e.participantIds || e.participantIds.length === 0) return;
      const share = e.amount / e.participantIds.length;

      if (net[e.payerId] !== undefined) net[e.payerId] += e.amount;

      e.participantIds.forEach(pid => {
        if (members[pid]) {
          spending[pid] += share;
          net[pid] -= share;
        }
      });
    });

    // 支出タブ
    const spendList = document.getElementById("spendingList");
    let totalEventCost = 0;
    Object.entries(spending).sort((a, b) => b[1] - a[1]).forEach(([id, amount]) => {
      const li = document.createElement("li");
      li.className = "card-item";
      li.innerHTML = `
        <div class="card-main">
          <div class="card-top">
            <span>${members[id]}</span>
            <span>${Math.round(amount).toLocaleString()}円</span>
          </div>
        </div>
      `;
      spendList.appendChild(li);
      totalEventCost += amount;
    });
    const totalDiv = document.createElement("div");
    totalDiv.style.textAlign = "right";
    totalDiv.style.fontWeight = "bold";
    totalDiv.style.marginTop = "10px";
    totalDiv.textContent = `合計: ${Math.round(totalEventCost).toLocaleString()}円`;
    sectionSpend.appendChild(totalDiv);

    // 支払いタブ
    const transferDiv = document.getElementById("transfers");
    const creditors = [];
    const debtors = [];

    Object.entries(net).forEach(([id, val]) => {
      const v = Math.round(val);
      if (v > 0) creditors.push({ id, amount: v });
      if (v < 0) debtors.push({ id, amount: v });
    });

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => a.amount - b.amount);

    const transfers = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const pay = Math.min(-d.amount, c.amount);

      if (pay > 0) {
        transfers.push({ from: d.id, to: c.id, amount: pay });
      }

      d.amount += pay;
      c.amount -= pay;

      if (Math.abs(d.amount) < 1) i++;
      if (c.amount < 1) j++;
    }

    transferDiv.innerHTML = "";
    let copyText = "【Team Pay 精算】\n\n";

    if (transfers.length === 0) {
      transferDiv.innerHTML = "<p class='muted'>精算の必要はありません 🎉</p>";
      copyText += "精算済みです！";
    } else {
      const ul = document.createElement("ul");
      ul.className = "card-list";
      transfers.forEach(t => {
        const li = document.createElement("li");
        li.className = "card-item";
        li.innerHTML = `
          <div class="card-main">
            <div class="card-top">
              <span>${members[t.from]} <span style="font-size:12px; color:#666;">→</span> ${members[t.to]}</span>
              <span class="text-red">${t.amount.toLocaleString()}円</span>
            </div>
            <div class="card-meta">支払ってください</div>
          </div>
        `;
        ul.appendChild(li);
        copyText += `${members[t.from]} → ${members[t.to]}： ${t.amount.toLocaleString()}円\n`;
      });
      transferDiv.appendChild(ul);
    }

    document.getElementById("copyForLineBtn").onclick = () => copyToClipboard(copyText, "精算結果をコピーしました");
  });
}

// ■ settings.html (設定画面)
// ■ settings.html (設定画面)
const settingsBody = document.body.dataset.page === "settings";
if (settingsBody) {
  const gid = getGroupId();
  const groupRef = doc(db, "groups", gid);

  // キャンセルボタン: 保存せずに戻る
  document.getElementById("cancelSettingsBtn").onclick = () => location.href = `group.html?g=${gid}`;

  // ローカルで編集内容を保持するための変数
  let currentCurrencies = {}; 

  // 初期ロード
  getDoc(groupRef).then(snap => {
    const data = snap.data();
    document.getElementById("groupNameInput").value = data.name;
    currentCurrencies = data.currencies || { "JPY": 1 };
    renderCurrencies(currentCurrencies);
  });

  // 保存ボタン: グループ名と通貨設定をまとめてFirestoreに保存
  document.getElementById("saveSettingsBtn").onclick = async () => {
    const newName = document.getElementById("groupNameInput").value.trim();
    if (!newName) return showToast("グループ名を入力してください", "error");

    // 通貨レートの入力値を反映
    const updatedCurrencies = {};
    // リストにある通貨コードを走査
    Object.keys(currentCurrencies).forEach(code => {
        if (code === 'JPY') {
            updatedCurrencies[code] = 1;
        } else {
            const input = document.getElementById(`rate-${code}`);
            if (input) {
                const val = parseFloat(input.value);
                updatedCurrencies[code] = val > 0 ? val : currentCurrencies[code];
            } else {
                updatedCurrencies[code] = currentCurrencies[code];
            }
        }
    });

    try {
      await updateDoc(groupRef, {
        name: newName,
        currencies: updatedCurrencies
      });
      showToast("設定を保存しました");
      setTimeout(() => location.href = `group.html?g=${gid}`, 500);
    } catch(e) {
      console.error(e);
      showToast("保存に失敗しました", "error");
    }
  };

  document.getElementById("copyInviteLinkBtn").onclick = () => {
    const url = `${location.origin}${location.pathname.replace("settings.html", "group.html")}?g=${gid}`;
    copyToClipboard(url, "招待リンクをコピーしました");
  };

  // --- メンバー管理 (ここは即時反映のままにします) ---
  const memList = document.getElementById("settingsMemberList");
  function loadMembers() {
    memList.innerHTML = "";
    getDocs(collection(groupRef, "members")).then(snap => {
      snap.forEach(d => {
        const li = document.createElement("li");
        li.className = "member-card";
        li.innerHTML = `
          <input type="text" value="${d.data().name}" id="mem-${d.id}" onchange="updateMember('${d.id}', this.value)">
          <div class="member-actions">
            <button class="secondary small danger" onclick="deleteMember('${d.id}', '${d.data().name}')">削除</button>
          </div>
        `;
        memList.appendChild(li);
      });
    });
  }
  loadMembers();

  window.updateMember = async (mid, newName) => {
    if (!newName.trim()) return showToast("名前を入力してください", "error");
    await updateDoc(doc(groupRef, "members", mid), { name: newName });
    showToast("名前を更新しました");
  };

  window.deleteMember = async (mid, name) => {
    if (confirm(`${name}さんを削除しますか？\n※この人が支払った記録も残りますが、精算計算に影響が出る可能性があります。`)) {
      await deleteDoc(doc(groupRef, "members", mid));
      loadMembers();
      showToast("削除しました");
    }
  };

  document.getElementById("addNewMemberBtn").onclick = async () => {
    const name = document.getElementById("addMemberInput").value.trim();
    if (!name) return showToast("名前を入力してください", "error");
    await setDoc(doc(groupRef, "members", generateId()), { name, createdAt: serverTimestamp() });
    document.getElementById("addMemberInput").value = "";
    loadMembers();
    showToast("メンバーを追加しました");
  };

  // --- 通貨管理 ---
  const currencyList = document.getElementById("currencyList");
  function renderCurrencies(currencies) {
    currencyList.innerHTML = "";
    Object.entries(currencies).forEach(([code, rate]) => {
      const li = document.createElement("li");
      li.className = "member-card";
      if (code === 'JPY') {
        li.innerHTML = `<span>🇯🇵 JPY (基準)</span><span>1.0</span>`;
      } else {
        // 削除ボタンに変更
        li.innerHTML = `
          <span style="font-weight:bold;">${code}</span>
          <div style="display:flex; gap:4px; align-items:center;">
            1 ${code} ≒ <input type="number" value="${rate}" style="width:80px; text-align:right; border-bottom:1px solid #ddd;" id="rate-${code}"> 円
            <button class="secondary small danger" onclick="removeCurrency('${code}')">削除</button>
          </div>
        `;
      }
      currencyList.appendChild(li);
    });
  }

  // 通貨削除 (ローカル変数のみ更新し、画面再描画)
  window.removeCurrency = (code) => {
    if (confirm(`${code} を削除しますか？\n(保存ボタンを押すまで確定しません)`)) {
      delete currentCurrencies[code];
      renderCurrencies(currentCurrencies);
    }
  };

  // 通貨追加画面へ
  document.getElementById("goAddCurrencyBtn").onclick = () => {
    // 現在の状態を保存してから行きたいが、シンプルに遷移させる
    // (本格的にやるならlocalStorage等で一時保存が必要だが、今回は省略)
    location.href = `currency_select.html?g=${gid}`;
  };

  // レート自動更新
  document.getElementById("autoRateBtn").onclick = async () => {
    // ... (前回のAPI処理と同じ) ...
    // 取得できたレートで currentCurrencies を更新して再描画
    try {
        // (中略: API呼び出しロジック)
        // 成功したら:
        // currentCurrencies[code] = newRate;
        // renderCurrencies(currentCurrencies);
        // showToast("レートを更新しました (保存ボタンで確定)");
        
        // ※ 既存のAPIロジックをここに移動し、最後の updateDoc を削除して
        // currentCurrencies 更新 → renderCurrencies に変える
        const codes = Object.keys(currentCurrencies).filter(c => c !== "JPY");
        if (codes.length === 0) return showToast("JPY以外がありません", "error");
        
        const url = `https://api.frankfurter.dev/v1/latest?base=JPY&symbols=${codes.join(",")}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const json = await res.json();
        
        codes.forEach(code => {
            if (json.rates[code]) currentCurrencies[code] = 1 / json.rates[code];
        });
        renderCurrencies(currentCurrencies);
        showToast("レートを更新しました (保存で確定)");

    } catch (e) {
        showToast("レート取得失敗", "error");
    }
  };
}