var DAYS_TO_SKIP = 2;

function setResult(date) {
    $("span#today").text(date.toDateString());
    $("span#result").text(shouldIString(date));
}

function toDateString(date) {
    return date.toISOString().slice(0, 10);
}

function getStoredResult(date, offset) {
    if (!offset) {
        offset = 0;
    }
    var targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    return localStorage.getItem(toDateString(targetDate));
}

function storeResult(date, result) {
    localStorage.setItem(toDateString(date), result);
}

function shouldI(date) {
    var storedResult = getStoredResult(date);
    if (storedResult) {
        return storedResult === "true";
    } else {
        var result = calculateShouldI(date);
        storeResult(date, result);
        return result;
    }
}

function calculateShouldI(date) {
    for (var offset=-DAYS_TO_SKIP; offset < 0; offset++) {
        if (getStoredResult(date, offset) === 'true') {
            return false;
        }
    }
    var random = Math.random();
    return (random < 1/(7 - DAYS_TO_SKIP));
}

function shouldIString(date) {
    return shouldI(date) ? "Yes, please!" : "No. Eat up!";
}

$(document).ready(
    function() {
        var date = new Date();
        setResult(date);
    });
