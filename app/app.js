document.addEventListener('DOMContentLoaded', () => {
    const ROWS = 9;
    const COLS_PER_BLOCK = 22;
    const TOTAL_COLS = COLS_PER_BLOCK * 2;
    const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'J'];
    const GROUP_NAMES = {
        'A': '中央',
        'B': '連合(前)',
        'C': 'アポロ',
        'D': 'ボアソルチ',
        'E': '連合(後)',
        'F': 'ショコラ',
        'H': 'kyu',
        'J': 'お立ち台'
    };

    let currentGroup = null;
    let seatData = {}; // {seatId: group}
    let isDragging = false;
    let lastProcessedSeatId = null;
    let dragAction = null; // 'paint' or 'erase'
    let lastX = null;
    let lastY = null;
    let isExpanded = false;

    const seatGrid = document.getElementById('seat-grid');
    const groupButtons = document.querySelectorAll('.group-btn');
    const specialInputA = document.getElementById('special-input-a');
    const currentGroupDisplay = document.getElementById('current-group-display');
    const colCountInputA = document.getElementById('col-count-a');
    const syncStatus = document.getElementById('sync-status');
    const lockBtn = document.getElementById('lock-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const expandBtn = document.getElementById('expand-btn');
    const podiumBtn = document.getElementById('podium-btn');
    const seatMapContainer = document.getElementById('seat-map-container');
    const scrollSlider = document.getElementById('scroll-slider');

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
                    if (el) {
                        el.classList.add(`group-${group}`);
                        el.dataset.color = group; // data-color属性も設定
                    }
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
        // グリッドをクリア (再生成用)
        seatGrid.innerHTML = '';
        const currentTotalCols = isExpanded ? TOTAL_COLS + COLS_PER_BLOCK : TOTAL_COLS;

        // 列番号のヘッダーを表示 (上端)
        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'grid-label';
        seatGrid.appendChild(emptyCorner);

        for (let c_index = 1; c_index <= currentTotalCols; c_index++) {
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

            // ブロックのリスト
            const blocks = isExpanded ? [1, 2, 3] : [1, 2];
            blocks.forEach(bId => {
                for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                    const seatId = `block${bId}-r${r}-c${c}`;
                    const seat = createSeatElement(seatId);

                    // 既存データの反映
                    if (seatData[seatId]) {
                        seat.classList.add(`group-${seatData[seatId]}`);
                        seat.dataset.color = seatData[seatId];
                    }
                    
                    seatGrid.appendChild(seat);
                }
            });
        }

        updateSliderRange();

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 初期化が終わったら読込 (初回のみ)
        if (Object.keys(seatData).length === 0) {
            loadData();
        }
    }

    function createSeatElement(id) {
        const div = document.createElement('div');
        div.className = 'seat';
        div.id = id;
        div.title = id;

        // --- マウス操作 ---
        div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            handleSeatClick(id, true); // 開始フラグ
        });

        div.addEventListener('mouseenter', () => {
            if (isDragging) {
                handleSeatClick(id);
            }
        });

        // --- タッチ操作 (スマホ) ---
        div.addEventListener('touchstart', (e) => {
            // タッチ開始時にマウスイベントの擬似発火を防止
            e.preventDefault();
            isDragging = true;
            const touch = e.touches[0];
            lastX = touch.clientX;
            lastY = touch.clientY;
            handleSeatClick(id, true);
        }, { passive: false });

        return div;
    }

    // 指定された座標の座席を処理
    function processPoint(x, y) {
        const target = document.elementFromPoint(x, y);
        if (target && target.classList.contains('seat')) {
            handleSeatClick(target.id);
        }
    }

    // 前回の座標から現在の座標までを補完して処理
    function processLine(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.ceil(dist / 10); // 10pxごとにサンプリング

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            processPoint(x, y);
        }
    }

    // タッチムーブ（補完処理付き）
    seatGrid.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const touch = e.touches[0];
        const currX = touch.clientX;
        const currY = touch.clientY;

        if (lastX !== null && lastY !== null) {
            processLine(lastX, lastY, currX, currY);
        } else {
            processPoint(currX, currY);
        }

        lastX = currX;
        lastY = currY;
    }, { passive: false });

    // ドラッグ状態のリセット
    function resetDrag() {
        isDragging = false;
        lastProcessedSeatId = null;
        dragAction = null;
        lastX = null;
        lastY = null;
    }

    window.addEventListener('mouseup', resetDrag);
    window.addEventListener('touchend', resetDrag);
    window.addEventListener('touchcancel', resetDrag);

    // 2. グループ選択
    groupButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;

            // アクティブ表示の切り替え
            groupButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentGroup = group;
            currentGroupDisplay.textContent = GROUP_NAMES[group] || 'なし';

            // ロック解除（色を選択した時点で自動的にロック解除）
            if (lockBtn) {
                lockBtn.classList.remove('locked');
                lockBtn.textContent = 'ロック';
            }

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

    // お立ち台ボタンの処理
    if (podiumBtn) {
        podiumBtn.addEventListener('click', () => {
            currentGroup = 'J';
            currentGroupDisplay.textContent = 'お立ち台';

            // 他のボタンのアクティブ表示を解除
            groupButtons.forEach(b => b.classList.remove('active'));
            specialInputA.classList.add('hidden');

            if (lockBtn) {
                lockBtn.classList.remove('locked');
                lockBtn.textContent = 'ロック';
            }
        });
    }

    // 3. 座席操作処理 (B-H用)
    function handleSeatClick(seatId, isStartOfAction = false) {
        // ロック状態（currentGroupがnullまたは空）の場合は何もしない
        if (!currentGroup || currentGroup === 'A') return;

        // 同一ドラッグ内（および瞬間の重複イベント）での同一マスの多重処理を徹底防止
        // これにより、タッチとマウスの二重発火による意図しないトグル（反転）を防ぐ
        if (seatId === lastProcessedSeatId) return;

        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;

        // 現在のマスの色を取得（data-color属性から）
        const currentColor = seatEl.dataset.color || '';

        // ドラッグ開始時に「塗る」か「消す」かを決定
        if (isStartOfAction) {
            isDragging = true;
            // 選択中の色と同じ場合は「消す」、空の場合は「塗る」
            dragAction = (currentColor === currentGroup) ? 'erase' : 'paint';
        }

        // ドラッグ中かつモードが決まっている場合のみ処理
        if (!isDragging || !dragAction) return;

        lastProcessedSeatId = seatId;

        if (dragAction === 'erase') {
            // 消しゴムモード: 選択中の色と同じ場合のみ消す
            if (currentColor === currentGroup) {
                updateSeat(seatId, null);
            }
        } else {
            // 塗りモード: 空のマスのみ塗る（他の色が塗られている場合はロック）
            if (currentColor === '') {
                updateSeat(seatId, currentGroup);
            }
            // currentColor !== '' && currentColor !== currentGroup の場合は何もしない（ロック）
        }
    }

    // ロックボタンの処理
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            // ロック状態に入る
            currentGroup = null;
            currentGroupDisplay.textContent = 'ロック中';

            // すべてのグループボタンの選択を解除
            groupButtons.forEach(b => b.classList.remove('active'));

            // Aグループの入力欄を非表示
            specialInputA.classList.add('hidden');

            // ロックボタンの表示を変更
            lockBtn.classList.add('locked');
            lockBtn.textContent = 'ロック中';
        });
    }

    // すべての座席をクリア
    function clearAllSeats() {
        if (!confirm('すべての座席選択を解除してもよろしいですか？')) return;

        // データのリセット
        seatData = {};

        // 表示のリセット
        const seats = document.querySelectorAll('.seat');
        seats.forEach(seat => {
            GROUPS.forEach(g => seat.classList.remove(`group-${g}`));
            seat.dataset.color = ''; // data-color属性もクリア
        });

        updateSummary();
        requestSave();
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            clearAllSeats();
        });
    }

    // 拡張ボタンの処理
    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;

            if (isExpanded) {
                expandBtn.textContent = '縮小';
                seatGrid.classList.add('expanded');
            } else {
                expandBtn.textContent = '拡張';
                seatGrid.classList.remove('expanded');
                requestSave();

                // 縮小時、スクロールを左端に戻す
                const container = document.getElementById('seat-map-container');
                if (container) {
                    container.scrollTo({
                        left: 0,
                        behavior: 'smooth'
                    });
                }
            }

            // 再描画
            createSeats();
            updateSummary();

            // 拡張時のみ、スクロールを左端に寄せる（既存エリアを維持）
            if (isExpanded) {
                const container = document.getElementById('seat-map-container');
                if (container) {
                    const scrollToLeft = () => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                container.scrollTo({
                                    left: 0,
                                    behavior: 'smooth'
                                });
                            });
                        });
                    };
                    scrollToLeft();
                }
            }
        });
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
            seatEl.dataset.color = group; // data-color属性に色を保存
            seatData[seatId] = group;
        } else {
            seatEl.dataset.color = ''; // data-color属性をクリア
            delete seatData[seatId];
        }

        updateSummary();
        requestSave();
    }

    // 4. Aグループ専用: 列数入力による一括処理
    function runGroupAFill() {
        const colCount = parseInt(colCountInputA.value);
        if (isNaN(colCount) || colCount < 0) return;

        // 全体の列数を取得
        const currentTotalCols = isExpanded ? TOTAL_COLS + COLS_PER_BLOCK : TOTAL_COLS;

        for (let r = 1; r <= ROWS; r++) {
            for (let c_index = 1; c_index <= currentTotalCols; c_index++) {
                let seatId;
                if (c_index <= COLS_PER_BLOCK) {
                    seatId = `block1-r${r}-c${c_index}`;
                } else if (c_index <= COLS_PER_BLOCK * 2) {
                    seatId = `block2-r${r}-c${c_index - COLS_PER_BLOCK}`;
                } else {
                    seatId = `block3-r${r}-c${c_index - COLS_PER_BLOCK * 2}`;
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

        // 表示されているブロックのみを集計対象にする
        const activeBlocks = isExpanded ? [1, 2, 3] : [1, 2];

        Object.keys(seatData).forEach(seatId => {
            const group = seatData[seatId];
            if (typeof seatId === 'string' && seatId.indexOf('block') === 0) {
                const blockId = parseInt(seatId.split('-')[0].replace('block', ''));
                if (activeBlocks.includes(blockId)) {
                    if (counts[group] !== undefined) {
                        counts[group]++;
                    }
                }
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

        // 中央以外合計を更新
        const totalBHEl = document.getElementById('count-total-BH');
        if (totalBHEl) {
            totalBHEl.textContent = totalBH;
        }
    }

    // --- スライダーバー関連 ---
    function updateSliderRange() {
        if (!scrollSlider || !seatMapContainer) return;

        // コンテナのスクロール可能な最大値を設定
        const maxScroll = seatMapContainer.scrollWidth - seatMapContainer.clientWidth;
        scrollSlider.max = maxScroll > 0 ? maxScroll : 0;
        scrollSlider.value = seatMapContainer.scrollLeft;
    }

    if (scrollSlider) {
        // スライダー操作時にスクロールを同期
        scrollSlider.addEventListener('input', () => {
            if (seatMapContainer) {
                seatMapContainer.scrollLeft = scrollSlider.value;
            }
        });
    }

    if (seatMapContainer) {
        // コンテナを直接スクロール（スワイプ等）した時にスライダーを同期
        seatMapContainer.addEventListener('scroll', () => {
            if (scrollSlider) {
                scrollSlider.value = seatMapContainer.scrollLeft;
            }
        });

        // ウィンドウのリサイズ時にも範囲を更新
        window.addEventListener('resize', updateSliderRange);
    }

    // 初期化
    createSeats();
    updateSummary();
});
