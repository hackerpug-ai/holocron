# Karat Interview Prep Guide for OnePay

Based on research into Karat's interview format and common question patterns.

## Quick Overview

- **Duration:** 60 minutes (10 min intro/domain + 40-45 min coding)
- **Format:** Milestone-based (3 progressive parts, solve 2+ to pass)
- **Focus:** Practical coding over algorithmic optimization
- **Pass Rate:** Only 21% of candidates pass
- **Key:** Communication + working solution > optimal solution

---

## Part 1: Domain Knowledge (10 minutes)

Keep answers SHORT and accurate. This section is less critical than coding.

### Backend/Common Questions

**Q: Given a banking application, which database would you use?**
- **Answer:** Relational database (PostgreSQL/MySQL)
- **Why:** ACID transactions are critical for financial data consistency
- **Trade-off:** Might add NoSQL (Redis) for caching/sessions

**Q: What two things would you prioritize in CAP theorem for banking?**
- **Answer:** Consistency + Partition Tolerance (CP)
- **Why:** Financial data must be accurate above all; network partitions happen
- **Trade-off:** Briefly mention eventual consistency for non-critical data

**Q: Explain REST vs. GraphQL trade-offs**
- **REST:**
  - Pros: Simple, cacheable, standard HTTP methods, tooling maturity
  - Cons: Over-fetching/under-fetching data, multiple round trips
- **GraphQL:**
  - Pros: Exact data needed, single query, strong typing
  - Cons: Complexity, caching challenges, N+1 query risk
- **When to use:** REST for standard CRUD, GraphQL for complex/nested data needs

### Frontend Questions

**Q: How do cookies and localStorage differ?**
- **Cookies:**
  - Sent with HTTP requests automatically
  - Size limit ~4KB
  - Has expiration, secure/HttpOnly flags
  - Used for sessions, auth tokens
- **localStorage:**
  - Doesn't send with requests
  - Size limit ~5-10MB
  - No built-in expiration
  - Used for UI state, preferences
- **When to use:** Cookies for auth/server data, localStorage for client-only data

---

## Part 2: Coding Questions (40-45 minutes)

### The Milestone Format

Questions build progressively. Example structure:

```
Part 1: Implement basic function
Part 2: Add edge case handling
Part 3: Extend functionality or optimize
```

### Core Patterns to Master

#### Pattern 1: Array/String + Hash Map Counting

**Example: Find First Non-Repeated Character**

```python
def first_non_repeated(s: str) -> str:
    # Part 1: Basic counting
    counts = {}
    for char in s:
        counts[char] = counts.get(char, 0) + 1

    # Part 2: Find first with count 1
    for char in s:
        if counts[char] == 1:
            return char
    return None  # Part 3: Handle no match case
```

**Verbalization:**
- "I'll use a hash map to count character frequencies"
- "Then iterate through the string again to find first count of 1"
- "Time O(n), space O(1) since alphabet is constant"

**Practice variations:**
- Find all duplicates in array
- Find majority element (> n/2 occurrences)
- Count word frequencies in a string

#### Pattern 2: String Parsing & Validation

**Example: Parse Log Entries**

```python
def parse_logs(logs: list[str]) -> dict:
    # Part 1: Basic parsing
    user_actions = {}

    for log in logs:
        # Assume format: "timestamp user_id action"
        parts = log.split()
        if len(parts) < 3:  # Part 2: Handle malformed entries
            continue

        user_id = parts[1]
        action = parts[2]

        # Part 3: Count actions per user
        if user_id not in user_actions:
            user_actions[user_id] = {}
        user_actions[user_id][action] = user_actions[user_id].get(action, 0) + 1

    return user_actions
```

**Verbalization:**
- "First I need to understand the log format"
- "I'll split each line and extract user_id and action"
- "Handle malformed entries by skipping them"
- "Use nested dict to track action counts per user"

**Practice variations:**
- Parse CSV data
- Extract URLs from text
- Validate email formats
- Parse JSON-like strings

#### Pattern 3: Matrix/2D Array Traversal

**Example: Count Connected Components**

```python
def count_islands(grid: list[list[str]]) -> int:
    if not grid:
        return 0

    rows, cols = len(grid), len(grid[0])
    count = 0

    def dfs(r: int, c: int):
        # Boundary and water check
        if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != '1':
            return

        # Mark visited
        grid[r][c] = '0'

        # Check all 4 directions
        dfs(r+1, c)
        dfs(r-1, c)
        dfs(r, c+1)
        dfs(r, c-1)

    # Part 1: Count islands
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                dfs(r, c)

    return count
```

**Verbalization:**
- "This is a connected components problem"
- "I'll use DFS to mark all connected land as visited"
- "When I find unvisited land, increment count and flood-fill"
- "Time O(rows × cols), space O(rows × cols) for recursion"

**Practice variations:**
- Find largest region of same value
- Validate if all rows/cols contain all numbers
- Rotate matrix 90 degrees
- Spiral traversal

#### Pattern 4: Debugging Existing Code

**Example: Fix Floating Point Comparison**

```python
# BUGGY CODE PROVIDED
def find_average(numbers: list[float]) -> float:
    total = 0
    for num in numbers:
        total += num
    return total / len(numbers)

def is_above_average(numbers: list[float], value: float) -> bool:
    avg = find_average(numbers)
    return value > avg  # Part 1: Works fine

def are_close(a: float, b: float, tolerance: float = 1e-9) -> bool:
    # Part 2: Fix floating point comparison
    return abs(a - b) < tolerance  # FIXED: Don't use == for floats

def find_differences(list1: list[float], list2: list[float]) -> list[int]:
    # Part 3: Find indices where values differ
    diff_indices = []
    for i, (a, b) in enumerate(zip(list1, list2)):
        if not are_close(a, b):  # FIXED: Use tolerance comparison
            diff_indices.append(i)
    return diff_indices
```

**Debugging Process:**
1. **Identify the bug:** "Floating point comparison with == is unreliable"
2. **Explain why:** "Floats have precision issues, 0.1 + 0.2 != 0.3 exactly"
3. **Fix it:** "Use tolerance-based comparison"
4. **Test it:** "Verify with edge cases like very small numbers"

---

## Interview Strategy

### During Domain Knowledge
1. **Keep answers under 1 minute each**
2. **Say "I don't know" quickly** if truly unfamiliar
3. **Relate to real experience** when possible

### During Coding

**ALWAYS think out loud:**
```
"I see we have a list of strings here. My first thought is we might need to
parse them and count frequencies, probably using a hash map. Let me think about
edge cases - empty strings, null values, different formats..."
```

**Ask clarifying questions:**
- "Can the input be empty?"
- "Are values case-sensitive?"
- "What should we return if no match found?"
- "Is there a size limit on the input?"

**Code structure:**
```python
def solution(input):
    # Part 1: Basic implementation
    # Part 2: Edge cases
    # Part 3: Extensions/optimization

    return result

# Test with examples
# Discuss complexity
```

**Order of operations:**
1. Clarify requirements
2. Discuss approach verbally
3. Write basic solution
4. Test with examples
5. Handle edge cases
6. Discuss time/space complexity

---

## 1-Week Prep Plan

### Days 1-2: Hash Map Mastery
- Practice: Character counting, frequency analysis
- LeetCode tags: Hash Table, String
- Focus: Medium difficulty

### Days 3-4: String Parsing
- Practice: Split/parse strings, validate formats
- Common patterns: CSV, logs, URLs
- Focus: Edge cases and malformed input

### Days 5-6: Matrix/Grid Problems
- Practice: DFS/BFS traversal, connected components
- Common patterns: Island counting, region detection
- Focus: Iteration with neighbor checking

### Day 7: Mock Interviews
- Practice talking through solutions
- Time yourself: 45 min per problem
- Focus: Communication over perfection

---

## Common Mistakes to Avoid

1. **Staying silent while thinking** - Verbalize everything
2. **Obsessing over optimal solution** - Working > optimal
3. **Skipping test cases** - Always walk through examples
4. **Ignoring edge cases** - Ask about them upfront
5. **Writing code without explaining** - Explain before, during, after
6. **Getting stuck on one part** - Move on, come back if time
7. **Forgetting to discuss complexity** - Always mention time/space

---

## Remember: Redo Policy

Many companies allow a **second chance** if:
- You had technical issues
- You were dissatisfied with performance
- You want to try again with prep

Treat first attempt as practice if needed!

---

## Practice Resources

**Focus on these patterns:**
- Arrays + Hash Tables (55% of questions)
- String manipulation (parsing, counting)
- Matrix/2D array traversal
- Multi-part progressive problems

**Avoid over-preparing:**
- Advanced graph algorithms (rare)
- Complex DP (rare)
- Exotic data structures (rare)

**Best prep:**
- Medium difficulty LeetCode with hash maps
- Real-world data processing scenarios
- Code reading and debugging practice

---

## Practice Problems

### Problem Set 1: Hash Map Counting (Easy-Medium)

**Problem: Find Duplicate Files**
```
You're given a list of file paths. Group files that have identical content.
Return groups of file paths (each group has duplicate content).

Part 1: Group by exact content hash
Part 2: Handle case-insensitive content
Part 3: Return groups with 3+ duplicates only
```

**Solution:**
```python
from collections import defaultdict

def find_duplicate_files(file_map: dict[str, str]) -> list[list[str]]:
    # file_map = {path: content}

    # Part 1: Group by content
    content_to_paths = defaultdict(list)
    for path, content in file_map.items():
        content_to_paths[content].append(path)

    # Part 2: Return all duplicates
    # Part 3: Filter for 3+ only
    result = [paths for paths in content_to_paths.values() if len(paths) >= 3]

    return result

# Test
files = {
    "/a.txt": "hello world",
    "/b.txt": "hello world",
    "/c.txt": "foo bar",
    "/d.txt": "hello world",
    "/e.txt": "baz"
}
# Returns: [["/a.txt", "/b.txt", "/d.txt"]]
```

---

### Problem Set 2: String Parsing (Medium)

**Problem: Parse User Activity Log**
```
Parse server logs in format: "[timestamp] USER:username ACTION:action"
Extract and return action counts per user.

Part 1: Parse and count actions per user
Part 2: Handle malformed lines gracefully
Part 3: Filter to only show users with 5+ actions
```

**Solution:**
```python
import re
from collections import defaultdict

def parse_activity_logs(logs: list[str]) -> dict[str, dict[str, int]]:
    user_actions = defaultdict(lambda: defaultdict(int))

    # Regex to extract user and action
    pattern = r'USER:(\w+)\s+ACTION:(\w+)'

    for log in logs:
        # Part 2: Handle malformed entries
        match = re.search(pattern, log)
        if not match:
            continue

        user = match.group(1)
        action = match.group(2)

        # Part 1: Count actions
        user_actions[user][action] += 1

    # Part 3: Filter active users
    return {
        user: actions
        for user, actions in user_actions.items()
        if sum(actions.values()) >= 5
    }

# Test
logs = [
    "[2024-01-01] USER:alice ACTION:login",
    "[2024-01-01] USER:bob ACTION:login",
    "[2024-01-01] USER:alice ACTION:view",
    "[2024-01-01] USER:alice ACTION:click",
    "malformed line here",
    "[2024-01-01] USER:alice ACTION:logout",
    "[2024-01-01] USER:bob ACTION:view",
]
```

---

### Problem Set 3: Matrix Operations (Medium)

**Problem: Island Perimeter**
```
Given a grid of 0s (water) and 1s (land), calculate the total perimeter
of all islands combined.

Part 1: Count perimeter for single island
Part 2: Handle multiple islands
Part 3: Optimize to single pass
```

**Solution:**
```python
def island_perimeter(grid: list[list[int]]) -> int:
    if not grid:
        return 0

    perimeter = 0
    rows, cols = len(grid), len(grid[0])

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                # Each land cell contributes 4 sides
                perimeter += 4

                # Check each neighbor, subtract shared edge
                if r > 0 and grid[r-1][c] == 1:  # Top
                    perimeter -= 1
                if r < rows-1 and grid[r+1][c] == 1:  # Bottom
                    perimeter -= 1
                if c > 0 and grid[r][c-1] == 1:  # Left
                    perimeter -= 1
                if c < cols-1 and grid[r][c+1] == 1:  # Right
                    perimeter -= 1

    return perimeter

# Test
grid = [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [1, 1, 0, 0]
]
# Returns: 16
```

---

### Problem Set 4: Debugging Challenge

**Problem: Find Transaction Anomalies**
```
This function is supposed to find transactions that differ significantly
from the average. Find and fix the bugs.
```

**Buggy Code:**
```python
def find_anomalies(transactions: list[float], threshold: float) -> list[int]:
    avg = sum(transactions) / len(transactions)
    anomalies = []

    for i, t in enumerate(transactions):
        # BUG: Uses == for float comparison
        if abs(t - avg) == threshold:
            anomalies.append(i)

    return anomalies
```

**Issues to identify:**
1. Float comparison with `==` is unreliable
2. Should use `>= threshold` not `== threshold`
3. No handling for empty transactions list

**Fixed Code:**
```python
def find_anomalies(transactions: list[float], threshold: float) -> list[int]:
    # Fix: Handle empty input
    if not transactions:
        return []

    avg = sum(transactions) / len(transactions)
    anomalies = []

    for i, t in enumerate(transactions):
        # Fix: Use >= for threshold comparison
        diff = abs(t - avg)
        if diff >= threshold:
            anomalies.append(i)

    return anomalies
```

---

### Problem Set 5: Progressive Extension

**Problem: Rate Limiter Tracker**
```
Track API requests per user to enforce rate limits.

Part 1: Count requests per user
Part 2: Return users exceeding limit (10 requests/minute)
Part 3: Add sliding window expiration
```

**Solution:**
```python
from collections import defaultdict
import time

class RateLimiter:
    def __init__(self, limit: int = 10, window: int = 60):
        self.limit = limit
        self.window = window
        self.requests = defaultdict(list)  # user -> list of timestamps

    def record_request(self, user: str, timestamp: float = None) -> bool:
        if timestamp is None:
            timestamp = time.time()

        # Part 1: Record request
        self.requests[user].append(timestamp)

        # Part 3: Clean old requests (sliding window)
        cutoff = timestamp - self.window
        self.requests[user] = [t for t in self.requests[user] if t > cutoff]

        # Part 2: Check if exceeding limit
        return len(self.requests[user]) > self.limit

    def get_violators(self) -> list[str]:
        """Return users currently exceeding rate limit"""
        return [user for user, reqs in self.requests.items()
                if len(reqs) > self.limit]

# Usage
limiter = RateLimiter(limit=10, window=60)
limiter.record_request("user1")  # Returns False (under limit)
# ... 10 more requests for user1
limiter.record_request("user1")  # Returns True (over limit)
violators = limiter.get_violators()  # Returns ["user1"]
```

---

## Additional Practice Scenarios

### Scenario 1: API Response Parser
```python
# Given nested JSON responses, extract specific fields
# Handle missing keys, type mismatches, null values

def extract_user_data(responses: list[dict]) -> list[dict]:
    # Extract: id, name, email from each response
    # Handle: missing fields, null values, wrong types
    pass
```

### Scenario 2: Cache Implementation
```python
# Simple LRU cache with get/set/evict
# Part 1: Basic get/set
# Part 2: Max size eviction
# Part 3: TTL expiration

class SimpleCache:
    def __init__(self, max_size: int = 100):
        pass

    def get(self, key: str) -> any:
        pass

    def set(self, key: str, value: any, ttl: int = None):
        pass
```

### Scenario 3: Data Validation Pipeline
```python
# Validate and transform CSV data
# Part 1: Parse CSV rows
# Part 2: Validate required fields
# Part 3: Transform data types

def process_csv(rows: list[str]) -> list[dict]:
    pass
```

---

## Before Interview Checklist

- [ ] Practice 5+ hash map problems
- [ ] Practice 3+ string parsing problems
- [ ] Practice 2+ matrix traversal problems
- [ ] Practice 1+ debugging exercise
- [ ] Do 2 mock interviews with timer
- [ ] Prepare verbal scripts for common patterns
- [ ] Test environment (IDE, internet connection)
- [ ] Have water nearby
- [ ] Good night's sleep before!
