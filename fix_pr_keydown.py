import re

with open('assets/js/purchase_register.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the keydown binding in init() with nothing
replace_from = """        // Bind Keyboard Navigation for the table (remove old to avoid duplicates)
        if (window._prKeydownHandler) {
            document.removeEventListener('keydown', window._prKeydownHandler);
        }
        window._prKeydownHandler = self.handleKeydown;
        document.addEventListener('keydown', window._prKeydownHandler);"""

replace_to = """        // Keyboard Navigation is now bound globally at the bottom of the script"""

content = content.replace(replace_from, replace_to)


# Add the global binder at the end of the file
replace_from_end = """    }
};"""

replace_to_end = """    }
};

// Bind Keyboard Navigation for the table GLOBALLY just ONCE to avoid duplication across script reloads
if (!window._globalPrKeydownBound) {
    document.addEventListener('keydown', function(e) {
        if (window.PurchaseRegisterReport && typeof window.PurchaseRegisterReport.handleKeydown === 'function') {
            window.PurchaseRegisterReport.handleKeydown(e);
        }
    });
    window._globalPrKeydownBound = true;
}"""

content = content.replace(replace_from_end, replace_to_end)

with open('assets/js/purchase_register.js', 'w', encoding='utf-8') as f:
    f.write(content)
