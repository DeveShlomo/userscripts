// ==UserScript==
// @name         Markdown Editor in NetFree
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  עורך טקסט מתקדם לנטפרי
// @author       לאצי&AI
// @match        https://netfree.link/app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netfree.link
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- הגדרות סגנון (CSS) ---
    const styles = `
        .nf-md-toolbar {
            display: flex;
            justify-content: space-between; /* מפריד בין הקבוצות לקצוות */
            padding: 6px;
            background: #f3f3f4;
            border: 1px solid #e7eaec;
            border-bottom: none;
            border-radius: 4px 4px 0 0;
            flex-wrap: wrap;
            direction: rtl;
            align-items: center;
            position: relative;
        }
        .nf-btn-group {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .nf-md-btn {
            background: #fff;
            border: 1px solid #ddd;
            cursor: pointer;
            width: 30px;
            height: 30px;
            color: #676a6c;
            border-radius: 3px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            position: relative;
        }
        .nf-md-btn:hover, .nf-md-btn.active {
            background-color: #fff;
            color: #1ab394;
            border-color: #1ab394;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .nf-md-active-textarea {
            border-top: none !important;
            border-top-left-radius: 0 !important;
            border-top-right-radius: 0 !important;
        }
        .nf-dropdown-menu {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            z-index: 1000;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 6px 12px rgba(0,0,0,0.175);
            min-width: 160px;
            padding: 5px 0;
            margin-top: 2px;
        }
        .nf-dropdown-menu.show { display: block; }
        .nf-dropdown-item {
            display: block;
            padding: 8px 15px;
            clear: both;
            font-weight: 400;
            line-height: 1.42857143;
            color: #333;
            white-space: nowrap;
            text-decoration: none;
            cursor: pointer;
            text-align: right;
        }
        .nf-dropdown-item:hover { background-color: #f5f5f5; color: #262626; }

        /* סגנון לתצוגה המקדימה החיה */
        #nf-live-preview-container {
            margin-bottom: 15px;
            margin-top: 10px;
            opacity: 1;
            transition: opacity 0.3s, margin 0.3s;
            border: 1px dashed #1ab394;
            background-color: rgba(255, 255, 255, 0.5);
            border-radius: 5px;
        }
        #nf-live-preview-container.hidden {
            display: none;
            opacity: 0;
            margin: 0;
        }
        .nf-separator {
            width: 1px; height: 20px; background: #ccc; margin: 0 5px;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- מנוע המרת Markdown ל-HTML (תומך markdown-it בסיסי) ---
    function markdownToHtml(text) {
        let html = text
            .replace(/```([\s\S]*?)```/g, (match, code) => '<pre>' + code.replace(/</g, '&lt;') + '</pre>')
            .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>')
            .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>')
            .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>')
            .replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>')
            .replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>')
            .replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>')
            .replace(/^\s*\*\*\*\s*$/gm, '<hr>') // קו מפריד
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/`([^`\n]+)`/g, '<code>$1</code>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:#1ab394">$1</a>')
            .replace(/^\*\s+(.*)/gm, '<li>$1</li>')
            .replace(/\n/g, '<br>');

        // ניקוי BR מיותרים
        html = html.replace(/<\/h(\d)><br>/g, '</h$1>');
        html = html.replace(/<\/div><br>/g, '</div>');
        html = html.replace(/<\/pre><br>/g, '</pre>');
        html = html.replace(/<hr><br>/g, '<hr>');

        return html;
    }

    // --- פונקציה להוספת טקסט שתומכת ב-Undo (Ctrl+Z) ---
    function insertTextCommand(textarea, text, selectStart, selectEnd) {
        textarea.focus();
        // שימוש ב-execCommand שומר על היסטוריית ה-Undo של הדפדפן
        const success = document.execCommand('insertText', false, text);

        // אם הפקודה נכשלה (קורה לפעמים), נשתמש בשיטה הישנה
        if (!success) {
            textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
        }

        // שחזור הבחירה אם נדרש
        if (typeof selectStart === 'number' && typeof selectEnd === 'number') {
            textarea.setSelectionRange(selectStart, selectEnd);
        }

        // עדכון אנגולר
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // --- לוגיקה חכמה רגילה ---
    function insertSmart(textarea, prefix, suffix, placeholder) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        let textToInsert = '';
        let newSelectStart, newSelectEnd;

        if (selectedText.length === 0) {
            textToInsert = prefix + placeholder + suffix;
            // חישוב המיקום החדש לבחירה (הפלייסהולדר)
            // מכיוון שאנחנו משתמשים ב-insertText, המיקום הוא יחסי למיקום הנוכחי
            // אבל execCommand מזיז את הסמן לסוף. נצטרך לחשב ידנית.
            const insertPos = start;
            insertTextCommand(textarea, textToInsert);
            textarea.setSelectionRange(insertPos + prefix.length, insertPos + prefix.length + placeholder.length);
        } else {
            textToInsert = prefix + selectedText + suffix;
            insertTextCommand(textarea, textToInsert);
            // במקרה של עטיפה, לרוב נרצה להשאיר את הסמן בסוף או לעטוף הכל. נשאיר בסוף.
        }
    }

    // --- לוגיקה ייעודית לקישורים (דרישה 1) ---
    function insertLink(textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        let finalString = "";
        let selectionOffsetStart = 0;
        let selectionOffsetEnd = 0;

        if (selectedText.length > 0) {
            // יש טקסט מסומן -> הוא הופך לטקסט של הקישור
            // [טקסט מסומן](כתובת קישור)
            finalString = `[${selectedText}](כתובת קישור)`;
            // אנחנו רוצים לסמן את "כתובת קישור"
            // המיקום הוא: נקודת ההתחלה + סוגריים + אורך הטקסט + סגירת סוגריים ופתיחת סוגריים עגולים
            selectionOffsetStart = start + 1 + selectedText.length + 2;
            selectionOffsetEnd = selectionOffsetStart + "כתובת קישור".length;
        } else {
            // אין טקסט מסומן
            // [טקסט קישור](כתובת קישור)
            finalString = `[טקסט קישור](כתובת קישור)`;
            // אנחנו רוצים לסמן את "כתובת קישור"
            selectionOffsetStart = start + "[טקסט קישור](".length;
            selectionOffsetEnd = selectionOffsetStart + "כתובת קישור".length;
        }

        insertTextCommand(textarea, finalString);
        textarea.setSelectionRange(selectionOffsetStart, selectionOffsetEnd);
    }

// --- יצירת התצוגה המקדימה ---
    function createLivePreview(textarea, toolbar) {
        // פונקציה פנימית לשליפת פרטים עדכניים
        const getUserDetails = () => {
            let name = "אני";
            let avatar = "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=mm&f=y";

            try {
                // סלקטור משופר שתופס את השם גם אם הקישור משתנה מעט
                const nameEl = document.querySelector('app-topnavbar a[href*="user/info"] span');
                if (nameEl) {
                    const fullName = nameEl.innerText.trim();
                    if (fullName) name = fullName.split(' ')[0]; // שם פרטי בלבד
                }
            } catch(e) {}

            const inputMessageContainer = textarea.closest('.chat-message');
            if (inputMessageContainer) {
                const avatarImg = inputMessageContainer.querySelector('img.message-avatar');
                if (avatarImg) avatar = avatarImg.src;
            }
            return { name, avatar };
        };

        // שליפה ראשונית
        let currentDetails = getUserDetails();

        const previewDiv = document.createElement('div');
        previewDiv.id = 'nf-live-preview-container';
        previewDiv.className = 'chat-message left';

        previewDiv.innerHTML = `
            <img class="message-avatar" style="border-radius: 100%; height: 38px; width: 38px;" src="${currentDetails.avatar}">
            <div class="message">
                <div class="title" style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
                    <strong class="preview-username">${currentDetails.name}</strong>
                    <div class="post-title-right" style="float: left;">
                        <span class="time-ago" style="font-weight: bold; color: #1ab394;">תצוגה מקדימה</span>
                    </div>
                </div>
                <div class="message-content" style="padding-top: 5px;"></div>
            </div>
        `;

        const inputMessageContainer = textarea.closest('.chat-message');
        if (inputMessageContainer && inputMessageContainer.parentNode) {
             inputMessageContainer.parentNode.insertBefore(previewDiv, inputMessageContainer.nextSibling);
        } else {
            textarea.parentNode.insertBefore(previewDiv, textarea.nextSibling);
        }

        const contentDiv = previewDiv.querySelector('.message-content');
        const usernameDiv = previewDiv.querySelector('.preview-username');
        const avatarImg = previewDiv.querySelector('img.message-avatar');

        const updatePreview = () => {
            const rawText = textarea.value;
            contentDiv.innerHTML = markdownToHtml(rawText);

            // מנגנון תיקון עצמי: אם השם הוא עדיין "אני", נסה לשלוף שוב את הפרטים
            if (currentDetails.name === "אני") {
                const newDetails = getUserDetails();
                if (newDetails.name !== "אני") {
                    currentDetails = newDetails;
                    usernameDiv.innerText = currentDetails.name;
                    avatarImg.src = currentDetails.avatar;
                }
            }
        };

        textarea.addEventListener('input', updatePreview);
        textarea.addEventListener('keyup', updatePreview);
        textarea.addEventListener('change', updatePreview);
        updatePreview();

        return previewDiv;
    }

    // --- יצירת הסרגל ---
    function createToolbar(textarea) {
        const toolbar = document.createElement('div');
        toolbar.className = 'nf-md-toolbar';
        toolbar.onmousedown = (e) => e.preventDefault();

        // מיכל לכפתורי העיצוב (צד ימין)
        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'nf-btn-group';

        const createBtn = (icon, title, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'nf-md-btn';
            btn.type = 'button';
            btn.title = title;
            btn.innerHTML = `<i class="fa ${icon}"></i>`;
            btn.onclick = (e) => {
                e.preventDefault();
                onClick();
            };
            return btn;
        };
        const createSep = () => {
            const div = document.createElement('div');
            div.className = 'nf-separator';
            return div;
        };

        // --- כפתורים לקבוצה הימנית ---

        // כותרות
        const headingWrapper = document.createElement('div');
        headingWrapper.style.position = 'relative';
        const headingBtn = createBtn('fa-heading', 'כותרת', () => { headingList.classList.toggle('show'); });
        const headingList = document.createElement('div');
        headingList.className = 'nf-dropdown-menu';
        for (let i = 1; i <= 6; i++) {
            const item = document.createElement('div');
            item.className = 'nf-dropdown-item';
            item.innerHTML = `<span style="color:#888; margin-left:5px;">H${i}</span> כותרת ${i}`;
            item.style.fontSize = (20 - i) + 'px';
            item.onclick = () => {
                insertSmart(textarea, '#'.repeat(i) + ' ', '', `כותרת ${i}`);
                headingList.classList.remove('show');
            };
            headingList.appendChild(item);
        }
        headingWrapper.appendChild(headingBtn);
        headingWrapper.appendChild(headingList);
        toolsGroup.appendChild(headingWrapper);

        toolsGroup.appendChild(createSep());

        // עיצוב בסיסי
        toolsGroup.appendChild(createBtn('fa-bold', 'מודגש', () => insertSmart(textarea, '**', '**', 'טקסט מודגש')));
        toolsGroup.appendChild(createBtn('fa-italic', 'נטוי', () => insertSmart(textarea, '*', '*', 'טקסט נטוי')));
        toolsGroup.appendChild(createBtn('fa-strikethrough', 'קו חוצה', () => insertSmart(textarea, '~~', '~~', 'קו חוצה')));

        toolsGroup.appendChild(createSep());

        // אלמנטים
        toolsGroup.appendChild(createBtn('fa-list-ul', 'רשימה', () => insertSmart(textarea, '* ', '', 'פריט רשימה')));
        // שימוש בפונקציית הקישור החדשה
        toolsGroup.appendChild(createBtn('fa-link', 'קישור', () => insertLink(textarea)));
        toolsGroup.appendChild(createBtn('fa-code', 'בלוק קוד', () => insertSmart(textarea, '\n```\n', '\n```\n', 'קוד')));
        toolsGroup.appendChild(createBtn('fa-minus', 'קו הפרדה', () => insertSmart(textarea, '\n***\n', '', '')));

        // הוספת הקבוצה הימנית לסרגל
        toolbar.appendChild(toolsGroup);

        // --- כפתור תצוגה מקדימה (צד שמאל - נפרד) ---
        const previewToggleBtn = document.createElement('button');
        previewToggleBtn.className = 'nf-md-btn';
        previewToggleBtn.title = 'הסתר תצוגה מקדימה';
        previewToggleBtn.innerHTML = `<i class="fa fa-eye-slash"></i>`;
        previewToggleBtn.onclick = (e) => {
            e.preventDefault();
            const previewContainer = document.getElementById('nf-live-preview-container');
            if (previewContainer) {
                const isHidden = previewContainer.classList.contains('hidden');
                if (isHidden) {
                    previewContainer.classList.remove('hidden');
                    previewToggleBtn.innerHTML = `<i class="fa fa-eye-slash"></i>`;
                    previewToggleBtn.title = 'הסתר תצוגה מקדימה';
                } else {
                    previewContainer.classList.add('hidden');
                    previewToggleBtn.innerHTML = `<i class="fa fa-eye"></i>`;
                    previewToggleBtn.title = 'הצג תצוגה מקדימה';
                }
            }
        };
        toolbar.appendChild(previewToggleBtn);

        // סגירת דרופדאון בלחיצה בחוץ
        document.addEventListener('click', (e) => {
            if (!headingWrapper.contains(e.target)) headingList.classList.remove('show');
        });

        return toolbar;
    }

    // --- טיפול ב-Ctrl+Enter לשליחה ---
    function setupCtrlEnter(textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const buttons = document.querySelectorAll('button');
                for (let btn of buttons) {
                    if (btn.innerText.includes('שלח') && !btn.disabled) {
                        btn.click();
                        break;
                    }
                }
            }
        });
    }

    // --- הזרקה לדף ---
    function scanAndInject() {
        const selectors = [
            'textarea[name="content"]',
            'textarea#respons-text',
            'textarea[placeholder="כתוב הודעה"]'
        ];

        selectors.forEach(selector => {
            const textareas = document.querySelectorAll(selector);
            textareas.forEach(textarea => {
                if (textarea.previousElementSibling && textarea.previousElementSibling.classList.contains('nf-md-toolbar')) {
                    return;
                }

                const toolbar = createToolbar(textarea);
                textarea.parentNode.insertBefore(toolbar, textarea);
                textarea.classList.add('nf-md-active-textarea');

                createLivePreview(textarea, toolbar);
                setupCtrlEnter(textarea);
            });
        });
    }

    const observer = new MutationObserver(() => scanAndInject());
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(scanAndInject, 1000);
})();
