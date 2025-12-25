// ==UserScript==
// @name         Markdown Editor in NetFree
// @namespace    http://tampermonkey.net/
// @version      3.1
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
            justify-content: space-between;
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
            min-width: 140px;
            padding: 5px 0;
            margin-top: 2px;
        }
        .nf-dropdown-menu.show { display: block; }
        .nf-dropdown-item {
            display: block;
            padding: 5px 15px;
            font-weight: 400;
            color: #333;
            cursor: pointer;
            text-align: right;
        }
        .nf-dropdown-item:hover { background-color: #f5f5f5; }

        /* סגנון לתצוגה המקדימה החיה */
        #nf-live-preview-container {
            margin-bottom: 15px;
            margin-top: 10px;
            opacity: 1;
            transition: opacity 0.3s;
            border: 1px dashed #1ab394;
            background-color: rgba(255, 255, 255, 0.5);
            border-radius: 5px;
        }
        #nf-live-preview-container.hidden {
            display: none !important;
        }

        /* עיצוב פנימי של התצוגה המקדימה */
        .nf-preview-content table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
        .nf-preview-content th, .nf-preview-content td { border: 1px solid #ddd; padding: 8px; text-align: right; }
        .nf-preview-content th { background-color: #f2f2f2; font-weight: bold; }
        .nf-preview-content blockquote { border-right: 5px solid #eee; padding-right: 15px; margin-right: 0; color: #777; margin: 10px 0; }
        .nf-preview-content img { max-width: 100%; height: auto; }
        .nf-preview-content ul, .nf-preview-content ol { padding-right: 20px; margin: 10px 0; }

        .nf-separator { width: 1px; height: 20px; background: #ccc; margin: 0 5px; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- מנוע המרת Markdown ל-HTML (משופר) ---
    function markdownToHtml(text) {
        // 1. ניקוי HTML קיים
        let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 2. שמירת בלוקי קוד
        const codeBlocks = [];
        html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
            codeBlocks.push(`<pre>${code}</pre>`);
            return `__CODEBLOCK_${codeBlocks.length - 1}__`;
        });

        // 3. טבלאות
        html = html.replace(/((?:^\|.*\|$\n?)+)/gm, (match) => {
            const lines = match.trim().split('\n');
            if (lines.length < 2) return match;
            let tableHtml = '<table>';
            lines.forEach((line, index) => {
                if (line.includes('---')) return;
                const cells = line.split('|').filter(c => c.trim() !== '');
                const tag = index === 0 ? 'th' : 'td';
                tableHtml += '<tr>';
                cells.forEach(cell => { tableHtml += `<${tag}>${cell.trim()}</${tag}>`; });
                tableHtml += '</tr>';
            });
            tableHtml += '</table>';
            return tableHtml;
        });

        // 4. רשימות (טיפול קבוצתי כדי לעטוף ב-UL/OL)
        // רשימה ממוספרת
        html = html.replace(/^(?:\d+\.\s+.*(?:\n|$))+/gm, (match) => {
            const items = match.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');
            return `<ol>${items}</ol>`;
        });
        // רשימה רגילה
        html = html.replace(/^(?:[\*\-]\s+.*(?:\n|$))+/gm, (match) => {
            const items = match.replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>');
            return `<ul>${items}</ul>`;
        });
        // 5. ציטוטים (תיקון: זיהוי ה-&gt; שנוצר לאחר הניקוי)
        html = html.replace(/((?:^&gt;.*(?:\n|$))+)/gm, (match) => {
            // מסיר את ה-&gt; ואת הרווח מתחילת השורה
            let content = match.replace(/^&gt;\s?(.*)/gm, '$1');
            content = content.replace(/\n/g, '<br>');
            return `<blockquote>${content}</blockquote>`;
        });

        // 6. עיצובים נוספים
        html = html
            .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>')
            .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>')
            .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>')
            .replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>')
            .replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>')
            .replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>')
            .replace(/^\s*(\*{3,}|-{3,})\s*$/gm, '<hr>')
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            // תמונות
            .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
                // אם זו תמונה שהועלתה לנטפרי (נתיב יחסי), נוסיף / בהתחלה
                if (url.trim().startsWith('upload-file/')) {
                    url = '/' + url.trim();
                }
                return `<img src="${url}" alt="${alt}">`;
            })
            // קישורים
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:#1ab394">$1</a>')
            .replace(/`([^`\n]+)`/g, '<code>$1</code>')
            // המרת ירידות שורה רגילות (שלא טופלו בבלוקים)
            .replace(/\n/g, '<br>');

        // 7. שחזור בלוקים וניקוי
        html = html.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => codeBlocks[index]);

        // ניקוי תגיות סוגרות שיש אחריהן BR מיותר
        const tagsToClean = ['h1','h2','h3','h4','h5','h6','div','pre','hr','table','blockquote','ol','ul','li'];
        tagsToClean.forEach(tag => {
            const regex = new RegExp(`<\/${tag}><br>`, 'g');
            html = html.replace(regex, `</${tag}>`);
        });

        return html;
    }

    // --- הוספת טקסט עם Undo ---
    function insertTextCommand(textarea, text, selectStart, selectEnd) {
        textarea.focus();
        const success = document.execCommand('insertText', false, text);
        if (!success) textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertSmart(textarea, prefix, suffix, placeholder) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);

        let textToInsert = selectedText.length === 0 ? prefix + placeholder + suffix : prefix + selectedText + suffix;
        insertTextCommand(textarea, textToInsert);

        if (selectedText.length === 0) {
            const newCursor = textarea.selectionEnd;
            textarea.setSelectionRange(newCursor - suffix.length - placeholder.length, newCursor - suffix.length);
        }
    }

    function insertLink(textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        let finalString = selectedText.length > 0 ? `[${selectedText}](כתובת קישור)` : `[טקסט קישור](כתובת קישור)`;
        insertTextCommand(textarea, finalString);
        const newCursor = textarea.selectionEnd;
        textarea.setSelectionRange(newCursor - "כתובת קישור".length - 1, newCursor - 1);
    }

    function insertTable(textarea) {
        const tableTemplate = `
| כותרת 1 | כותרת 2 |
|---|---|
| תא 1 | תא 2 |
`;
        insertTextCommand(textarea, tableTemplate);
    }

    // --- יצירת התצוגה המקדימה ---
    function createLivePreview(textarea, toolbar) {
        const getUserDetails = () => {
            let name = "אני";
            let avatar = "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=mm&f=y";
            try {
                const nameEl = document.querySelector('app-topnavbar a[href*="user/info"] span');
                if (nameEl) {
                    const fullName = nameEl.innerText.trim();
                    if (fullName) name = fullName.split(' ')[0];
                }
            } catch(e) {}
            const inputMessageContainer = textarea.closest('.chat-message');
            if (inputMessageContainer) {
                const avatarImg = inputMessageContainer.querySelector('img.message-avatar');
                if (avatarImg) avatar = avatarImg.src;
            }
            return { name, avatar };
        };

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
                <div class="message-content nf-preview-content" style="padding-top: 5px;"></div>
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
            contentDiv.innerHTML = markdownToHtml(textarea.value);
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

    // --- סרגל כלים ---
    function createToolbar(textarea) {
        const toolbar = document.createElement('div');
        toolbar.className = 'nf-md-toolbar';
        toolbar.onmousedown = (e) => e.preventDefault();

        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'nf-btn-group';

        const createBtn = (icon, title, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'nf-md-btn';
            btn.type = 'button';
            btn.title = title;
            btn.innerHTML = `<i class="fa ${icon}"></i>`;
            btn.onclick = (e) => { e.preventDefault(); onClick(); };
            return btn;
        };
        const createSep = () => {
            const div = document.createElement('div');
            div.className = 'nf-separator';
            return div;
        };

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
        toolsGroup.appendChild(createBtn('fa-bold', 'מודגש', () => insertSmart(textarea, '**', '**', 'טקסט מודגש')));
        toolsGroup.appendChild(createBtn('fa-italic', 'נטוי', () => insertSmart(textarea, '*', '*', 'טקסט נטוי')));
        toolsGroup.appendChild(createBtn('fa-strikethrough', 'קו חוצה', () => insertSmart(textarea, '~~', '~~', 'קו חוצה')));

        toolsGroup.appendChild(createSep());
        toolsGroup.appendChild(createBtn('fa-list-ul', 'רשימה', () => insertSmart(textarea, '* ', '', 'פריט רשימה')));
        toolsGroup.appendChild(createBtn('fa-list-ol', 'רשימה ממוספרת', () => insertSmart(textarea, '1. ', '', 'פריט ראשון')));
        toolsGroup.appendChild(createBtn('fa-quote-right', 'ציטוט', () => insertSmart(textarea, '> ', '', 'טקסט מצוטט')));

        toolsGroup.appendChild(createSep());
        toolsGroup.appendChild(createBtn('fa-link', 'קישור', () => insertLink(textarea)));
        toolsGroup.appendChild(createBtn('fa-image', 'תמונה', () => insertSmart(textarea, '![תיאור תמונה](', ')', 'כתובת התמונה')));
        toolsGroup.appendChild(createBtn('fa-table', 'טבלה', () => insertTable(textarea)));

        toolsGroup.appendChild(createSep());
        toolsGroup.appendChild(createBtn('fa-code', 'בלוק קוד', () => insertSmart(textarea, '\n```\n', '\n```\n', 'קוד')));
        toolsGroup.appendChild(createBtn('fa-minus', 'קו הפרדה', () => insertSmart(textarea, '\n***\n', '', '')));

        toolbar.appendChild(toolsGroup);

        const previewToggleBtn = document.createElement('button');
        previewToggleBtn.className = 'nf-md-btn';
        previewToggleBtn.title = 'הסתר תצוגה מקדימה';
        previewToggleBtn.innerHTML = `<i class="fa fa-eye-slash"></i>`;
        previewToggleBtn.onclick = (e) => {
            e.preventDefault();
            const previewContainer = document.getElementById('nf-live-preview-container');
            if (previewContainer) {
                const isHidden = previewContainer.classList.contains('hidden');
                previewContainer.classList.toggle('hidden');
                previewToggleBtn.innerHTML = isHidden ? `<i class="fa fa-eye-slash"></i>` : `<i class="fa fa-eye"></i>`;
                previewToggleBtn.title = isHidden ? 'הסתר תצוגה מקדימה' : 'הצג תצוגה מקדימה';
            }
        };
        toolbar.appendChild(previewToggleBtn);

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
                    // תיקון: בדיקה מורחבת גם ל"שליחת"
                    if ((btn.innerText.includes('שלח') || btn.innerText.includes('שליחת')) && !btn.disabled) {
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
