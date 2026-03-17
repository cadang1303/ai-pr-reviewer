// Sample JavaScript file with intentional bugs

function calculateTotal(price, quantity) {
    // Bug 1: Using assignment instead of multiplication
    let total = price = quantity;
    return total;
}

function getUserName(user) {
    // Bug 2: Possible undefined access
    return user.name.toUpperCase();
}

function fetchData() {
    // Bug 3: Missing await for async call
    let response = fetch('https://api.example.com/data');
    let data = response.json();
    console.log(data);
}

function addNumbers(a, b) {
    // Bug 4: String concatenation instead of number addition
    return a + b;
}

// Bug 5: Infinite loop
function runLoop() {
    let i = 0;
    while (i < 10) {
        console.log(i);
        // Missing increment
    }
}

// Bug 6: Typo in variable name
let userAge = 25;
console.log(userage);

// Bug 7: Incorrect comparison
if (5 == '5') {
    console.log('Equal');
}

// Bug 8: Function not returning expected value
function isEven(num) {
    if (num % 2 === 0) {
        return true;
    }
}

// Execute functions
console.log(calculateTotal(10, 5));
console.log(getUserName({}));
fetchData();
console.log(addNumbers('10', 5));
runLoop();
console.log(isEven(4));