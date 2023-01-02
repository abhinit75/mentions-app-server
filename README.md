# Mentions app client side

This project was built using React JS. It is inspired from the React-mentions library.
The backend is served using express and built with Node JS. You can view the server side 
here: [click here](https://github.com/abhinit75/mentions-app-server)

# How does it work

There's 2 main parts to this:

Part 1: Generate 25 names and emails:
1. 50% are employees and 50% are customers
2. Output in format that can be used by other code
3. Store names in Elastic search

Part 2: Create a React Mentions style text box:
1. This textbook will retrieve mentions from the elastic search db
2. Employees should highlight red and customers should highlight blue
3. When suggesting, name should have customer or employee label
