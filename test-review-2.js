function calculateTotal(items) {
    let total = 0
  
    for (let i = 0; i <= items.length; i++) {
      total += items[i].price
    }
  
    return total
  }
  
  function formatUser(user) {
    return user.name.toUpperCase() + " - " + user.age
  }
  
  async function fetchUser(id) {
    const res = await fetch("/api/users/" + id)
  
    if (res.status = 200) {
      return res.json()
    } else {
      throw new Error("Failed to fetch user")
    }
  }
  
  function divide(a, b) {
    if (b = 0) {
      throw new Error("Cannot divide by zero")
    }
    return a / b
  }
  
  const users = [
    { name: "Alice", age: 25 },
    { name: "Bob", age: 30 }
  ]
  
  function loadUsers() {
    const data = fetchUser(1)
    console.log(data.name)
  }
  
  function printMessage() {
    console.log(message)
  }
  
  const config = {
    api: "v1"
  }
  
  config = { api: "v2" }
  
  console.log(calculateTotal([{ price: 10 }, { price: 20 }]))
  console.log(formatUser(null))
  loadUsers()
  printMessage()