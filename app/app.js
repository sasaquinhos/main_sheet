document.addEventListener('DOMContentLoaded', () => {
    const ROWS = 9;
    const COLS_PER_BLOCK = 22;
    const TOTAL_COLS = COLS_PER_BLOCK * 2;
    const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    let currentGroup = null;
    let seatData = {}; // {seatId: group}
    let isDragging = false;

    const seatGrid = document.getElementById('seat-grid');
    const groupButtons = document.querySelectorAll('.group-btn');
    const specialInputA = document.getElementById('special-input-a');
    const currentGroupDisplay = document.getElementById('current-group-display');
    const colCountInputA = document.getElementById('col-count-a');
    const syncStatus = document.getElementById('sync-status');

    // --- Web化対応: API設定 (GAS デプロイ後に URL を差し替えてください) ---
    const API_URL = "https://script.google.com/macros/s/AKfycbz2ooGzDOuEm-VqcJ3DEj6xsHS2b1O2zCe0Ah0gKqO26EF0qViKpbJe8gzgwDFL-H61/exec";

    // 0. データの読込・保存
    async function loadData() {
        if (!API_URL) return;
        setSyncStatus('saving', '読込中...');
        try {
            const res = await fetch(API_URL);
            const json = await res.json();
            if (json.status === "success" && json.data) {
                seatData = json.data;
                // 反映
                Object.entries(seatData).forEach(([id, group]) => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add(`group-${group}`);
                });
                updateSummary();
            }
            setSyncStatus('idle', '同期完了');
        } catch (e) {
            console.error(e);
            setSyncStatus('error', '読込失敗');
        }
    }

    let saveTimeout = null;
    function requestSave() {
        if (!API_URL) return;
        setSyncStatus('saving', '保存中...');
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveData, 2000); // 2秒後に保存（頻度を抑える）
    }

    async function saveData() {
        try {
            await fetch(API_URL, {
                method: "POST",
                mode: "no-cors", // GASへのPOSTは CORS 制限回避のため no-cors が簡便
                body: JSON.stringify(seatData)
            });
            setSyncStatus('idle', '保存完了');
        } catch (e) {
            console.error(e);
            setSyncStatus('error', '保存失敗');
        }
    }

    function setSyncStatus(type, text) {
        if (!syncStatus) return;
        syncStatus.className = `sync-${type}`;
        syncStatus.textContent = text;
    }

    // 1. 座席の生成
    function createSeats() {
        // 列番号のヘッダーを表示 (上端)
        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'grid-label';
        seatGrid.appendChild(emptyCorner);

        for (let c_index = 1; c_index <= TOTAL_COLS; c_index++) {
            const colLabel = document.createElement('div');
            colLabel.className = 'grid-label col-label';
            colLabel.textContent = 88 + c_index;
            seatGrid.appendChild(colLabel);
        }

        for (let r = 1; r <= ROWS; r++) {
            const rowLabel = document.createElement('div');
            rowLabel.className = 'grid-label row-label';
            rowLabel.textContent = (ROWS - r + 1);
            seatGrid.appendChild(rowLabel);

            for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                const seatId = `block1-r${r}-c${c}`;
                const seat = createSeatElement(seatId);
                seatGrid.appendChild(seat);
            }
            for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                const seatId = `block2-r${r}-c${c}`;
                const seat = createSeatElement(seatId);
                seatGrid.appendChild(seat);
            }
        }

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 初期化が終わったら読込
        loadData();
    }

    function createSeatElement(id) {
        const div = document.createElement('div');
        div.className = 'seat';
        div.id = id;
        div.title = id;

        // --- マウス操作 ---
        div.addEventListener('mousedown', (e) => {
            e.preventDefault(); // テキスト選択などを防止
            isDragging = true;
            handleSeatClick(id);
        });

        div.addEventListener('mouseenter', () => {
            if (isDragging) {
                handleSeatClick(id);
            }
        });

        // --- タッチ操作 (スマホ) ---
        div.addEventListener('touchstart', (e) => {
            // e.preventDefault(); // スクロール抑止は CSS (touch-action) で行うが、念のため
            isDragging = true;
            handleSeatClick(id);
        }, { passive: false });

        return div;
    }

    // タッチムーブ（指の下にある要素を特定して塗りつぶす）
    // グリッドコンテナまたは window で監視
    seatGrid.addEventListener('touchmove', (e) => {
        if (!isDragging) return;

        // デフォルトのスクロール動作を抑制
        e.preventDefault();

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // 'seat' クラスを持つ要素のみを処理対象とする（ラベルは無視）
        if (target && target.classList.contains('seat')) {
            handleSeatClick(target.id);
        }
    }, { passive: false });

    seatGrid.addEventListener('touchend', () => {
        isDragging = false;
    });

    // 2. グループ選択
    groupButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;

            // アクティブ表示の切り替え
            groupButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentGroup = group;
            currentGroupDisplay.textContent = `グループ ${group}`;

            // Aグループ特有の表示制御
            if (group === 'A') {
                specialInputA.classList.remove('hidden');
                // 少し遅延させて確実にフォーカスを当てる
                setTimeout(() => colCountInputA.focus(), 10);
            } else {
                specialInputA.classList.add('hidden');
            }
        });
    });

    // 3. 座席操作処理 (B-H用)
    function handleSeatClick(seatId, forceResetDrag = false) {
        if (!currentGroup) {
            // ドラッグ中はアラートを出さない（操作性を損なうため）
            if (forceResetDrag) isDragging = false;
            return;
        }

        // Aグループはクリックでは動作しない（仕様）
        if (currentGroup === 'A') {
            return;
        }

        // すでに現在のグループが設定されている場合は解除（トグル）
        // それ以外（空または別グループ）の場合は現在のグループで上書き
        if (seatData[seatId] === currentGroup) {
            updateSeat(seatId, null);
        } else {
            updateSeat(seatId, currentGroup);
        }
    }

    // 座席の状態を更新
    function updateSeat(seatId, group) {
        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;

        // 既存のクラスを削除
        GROUPS.forEach(g => seatEl.classList.remove(`group-${g}`));

        // 新しいクラスを追加
        if (group) {
            seatEl.classList.add(`group-${group}`);
            seatData[seatId] = group;
        } else {
            delete seatData[seatId];
        }

        updateSummary();
        requestSave();
    }

    // 4. Aグループ専用: 列数入力による一括処理
    function runGroupAFill() {
        const colCount = parseInt(colCountInputA.value);
        if (isNaN(colCount) || colCount < 0) return;

        // 全体の列は 1〜44
        for (let r = 1; r <= ROWS; r++) {
            for (let c_index = 1; c_index <= TOTAL_COLS; c_index++) {
                let seatId;
                if (c_index <= COLS_PER_BLOCK) {
                    seatId = `block1-r${r}-c${c_index}`;
                } else {
                    seatId = `block2-r${r}-c${c_index - COLS_PER_BLOCK}`;
                }

                if (c_index <= colCount) {
                    updateSeat(seatId, 'A');
                } else {
                    if (seatData[seatId] === 'A') {
                        updateSeat(seatId, null);
                    }
                }
            }
        }
    }

    // 入力確定時（エンターキーまたはフォーカスアウト）に実行
    colCountInputA.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            runGroupAFill();
            colCountInputA.blur(); // 入力を確定させる
        }
    });

    colCountInputA.addEventListener('blur', () => {
        runGroupAFill();
    });

    // 5. リアルタイム集計
    function updateSummary() {
        const counts = {};
        GROUPS.forEach(g => counts[g] = 0);

        Object.values(seatData).forEach(group => {
            if (counts[group] !== undefined) {
                counts[group]++;
            }
        });

        // 各ボタンのカウントを更新
        let totalBH = 0;
        GROUPS.forEach(g => {
            const countEl = document.getElementById(`count-${g}`);
            if (countEl) {
                countEl.textContent = counts[g];
            }
            if (g !== 'A') {
                totalBH += counts[g];
            }
        });

        // B～H合計を更新
        const totalBHEl = document.getElementById('count-total-BH');
        if (totalBHEl) {
            totalBHEl.textContent = totalBH;
        }
    }

    // 初期化
    createSeats();
    updateSummary();
});
