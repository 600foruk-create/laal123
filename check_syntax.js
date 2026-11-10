const fs = require('fs');
const jsCode = fs.readFileSync('d:/SOFTIFYX FINANCIAL/SOFTIFYXFINANCIALS/assets/js/general_journal_voucher.js', 'utf8');
try {
    new Function(jsCode);
    console.log("No syntax error.");
} catch(e) {
    console.error(e.toString());
}
