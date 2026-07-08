function jsonString(value) {
  return JSON.stringify(value);
}

function extractJavaImports(code) {
  const importLines = [];
  const cleanCodeLines = [];
  for (const line of code.split('\n')) {
    if (line.trim().startsWith('import ')) {
      importLines.push(line.trim());
    } else {
      cleanCodeLines.push(line);
    }
  }
  return {
    cleanCode: cleanCodeLines.join('\n'),
    userImports: importLines.join('\n')
  };
}

function parseInput(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function javaString(value) {
  return JSON.stringify(value);
}

function javaIntArray(values) {
  return `new int[]{${values.join(',')}}`;
}

function javaCharArray(values) {
  return `new char[]{${values.map((item) => `'${String(item).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',')}}`;
}

function javaTreeArray(values) {
  return `new Integer[]{${values.map((item) => (item === null ? 'null' : item)).join(',')}}`;
}

function javaArg(parameter, value) {
  if (parameter.type === 'int[]') return javaIntArray(value);
  if (parameter.type === 'char[]') return javaCharArray(value);
  if (parameter.type === 'string') return javaString(value);
  if (parameter.type === 'int') return String(value);
  if (parameter.type === 'double') return String(value);
  if (parameter.type === 'boolean') return String(value);
  if (parameter.type === 'ListNode') return `buildList(${javaIntArray(value || [])})`;
  if (parameter.type === 'TreeNode') return `buildTree(${javaTreeArray(value || [])})`;
  return 'null';
}

function cppString(value) {
  return JSON.stringify(value);
}

function cppChar(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function cppVector(values, type) {
  return `vector<${type}>{${values.join(',')}}`;
}

function cppCharVector(values) {
  return `vector<char>{${values.map(cppChar).join(',')}}`;
}

function cppTreeVector(values) {
  return `vector<optional<int>>{${values
    .map((item) => (item === null ? 'nullopt' : item))
    .join(',')}}`;
}

function cppArg(parameter, value) {
  if (parameter.type === 'int[]') return cppVector(value, 'int');
  if (parameter.type === 'char[]') return cppCharVector(value);
  if (parameter.type === 'string') return cppString(value);
  if (parameter.type === 'int') return String(value);
  if (parameter.type === 'double') return String(value);
  if (parameter.type === 'boolean') return value ? 'true' : 'false';
  if (parameter.type === 'ListNode') return `buildList(${cppVector(value || [], 'int')})`;
  if (parameter.type === 'TreeNode') return `buildTree(${cppTreeVector(value || [])})`;
  return '{}';
}

function pythonHarness({ problem, code, input }) {
  const inputJson = JSON.stringify(input);
  const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
  const firstParam = problem.parameters[0]?.name;
  const resultExpression =
    problem.returnType === 'void'
      ? firstParam
      : `result`;

  return `import json
import sys
import time
from typing import *

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build_list(values):
    dummy = ListNode()
    current = dummy
    for value in values or []:
        current.next = ListNode(value)
        current = current.next
    return dummy.next

def list_to_array(node):
    values = []
    while node is not None:
        values.append(node.val)
        node = node.next
    return values

def build_tree(values):
    if not values:
        return None
    nodes = [None if value is None else TreeNode(value) for value in values]
    child = 1
    for node in nodes:
        if node is not None:
            if child < len(nodes):
                node.left = nodes[child]
                child += 1
            if child < len(nodes):
                node.right = nodes[child]
                child += 1
    return nodes[0]

def output_value(value):
    if isinstance(value, ListNode):
        value = list_to_array(value)
    if isinstance(value, str):
        print(value)
    else:
        print(json.dumps(value, separators=(',', ':')))

${code}

_input = json.loads(${jsonString(inputJson)})
${problem.parameters
  .map((parameter) => {
    if (parameter.type === 'ListNode') {
      return `${parameter.name} = build_list(_input.get(${jsonString(parameter.name)}, []))`;
    }
    if (parameter.type === 'TreeNode') {
      return `${parameter.name} = build_tree(_input.get(${jsonString(parameter.name)}, []))`;
    }
    return `${parameter.name} = _input.get(${jsonString(parameter.name)})`;
  })
  .join('\n')}
_start = time.perf_counter()
${problem.returnType === 'void' ? `Solution().${problem.functionName}(${callArgs})` : `result = Solution().${problem.functionName}(${callArgs})`}
_end = time.perf_counter()
sys.stderr.write(f"EXECUTION_TIME_MS:{(_end - _start) * 1000:.3f}\\n")
output_value(${resultExpression})
`;
}

function javaHarness({ problem, code, input }) {
  const declarations = problem.parameters
    .map((parameter) => `${javaType(parameter.type)} ${parameter.name} = ${javaArg(parameter, input[parameter.name])};`)
    .join('\n        ');
  const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
  const firstParam = problem.parameters[0]?.name;
  const callLine =
    problem.returnType === 'void'
      ? `long startTime = System.nanoTime();\n        solution.${problem.functionName}(${callArgs});\n        long endTime = System.nanoTime();\n        System.err.println("EXECUTION_TIME_MS:" + ((endTime - startTime) / 1000000.0));\n        printValue(${firstParam});`
      : `long startTime = System.nanoTime();\n        var result = solution.${problem.functionName}(${callArgs});\n        long endTime = System.nanoTime();\n        System.err.println("EXECUTION_TIME_MS:" + ((endTime - startTime) / 1000000.0));\n        printValue(result);`;

  const { cleanCode, userImports } = extractJavaImports(code);

  return `${userImports}
import java.util.*;

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

${cleanCode}

public class Main {
    public static void main(String[] args) {
        ${declarations}
        Solution solution = new Solution();
        ${callLine}
    }

    static ListNode buildList(int[] values) {
        ListNode dummy = new ListNode();
        ListNode current = dummy;
        for (int value : values) {
            current.next = new ListNode(value);
            current = current.next;
        }
        return dummy.next;
    }

    static TreeNode buildTree(Integer[] values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.add(root);
        int index = 1;
        while (!queue.isEmpty() && index < values.length) {
            TreeNode node = queue.poll();
            if (index < values.length && values[index] != null) {
                node.left = new TreeNode(values[index]);
                queue.add(node.left);
            }
            index++;
            if (index < values.length && values[index] != null) {
                node.right = new TreeNode(values[index]);
                queue.add(node.right);
            }
            index++;
        }
        return root;
    }

    static void printValue(int value) { System.out.print(value); }
    static void printValue(double value) { System.out.print(value); }
    static void printValue(boolean value) { System.out.print(value); }
    static void printValue(String value) { System.out.print(value); }
    static void printValue(int[] values) { System.out.print(toJson(values)); }
    static void printValue(char[] values) { System.out.print(toJson(values)); }
    static void printValue(ListNode node) { System.out.print(toJson(node)); }
    static void printValue(List<?> list) { System.out.print(toJson(list)); }

    static String toJson(int[] values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) out.append(",");
            out.append(values[i]);
        }
        return out.append("]").toString();
    }

    static String toJson(char[] values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) out.append(",");
            out.append("\\\"").append(values[i]).append("\\\"");
        }
        return out.append("]").toString();
    }

    static String toJson(ListNode node) {
        StringBuilder out = new StringBuilder("[");
        boolean first = true;
        while (node != null) {
            if (!first) out.append(",");
            out.append(node.val);
            first = false;
            node = node.next;
        }
        return out.append("]").toString();
    }

    static String toJson(List<?> list) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) out.append(",");
            Object val = list.get(i);
            if (val instanceof Character) {
                out.append("\\\"").append(val).append("\\\"");
            } else {
                out.append(val);
            }
        }
        return out.append("]").toString();
    }
}
`;
}

function javaType(type) {
  const map = {
    'int[]': 'int[]',
    'char[]': 'char[]',
    string: 'String',
    int: 'int',
    double: 'double',
    boolean: 'boolean',
    void: 'void',
    ListNode: 'ListNode',
    TreeNode: 'TreeNode'
  };
  return map[type] || 'Object';
}

function cppHarness({ problem, code, input }) {
  const declarations = problem.parameters
    .map((parameter) => `${cppType(parameter.type)} ${parameter.name} = ${cppArg(parameter, input[parameter.name])};`)
    .join('\n    ');
  const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
  const firstParam = problem.parameters[0]?.name;
  const callLine =
    problem.returnType === 'void'
      ? `auto startTime = chrono::high_resolution_clock::now();\n    solution.${problem.functionName}(${callArgs});\n    auto endTime = chrono::high_resolution_clock::now();\n    cerr << "EXECUTION_TIME_MS:" << chrono::duration<double, milli>(endTime - startTime).count() << endl;\n    printValue(${firstParam});`
      : `auto startTime = chrono::high_resolution_clock::now();\n    auto result = solution.${problem.functionName}(${callArgs});\n    auto endTime = chrono::high_resolution_clock::now();\n    cerr << "EXECUTION_TIME_MS:" << chrono::duration<double, milli>(endTime - startTime).count() << endl;\n    printValue(result);`;

  return `#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

ListNode* buildList(const vector<int>& values) {
    ListNode dummy;
    ListNode* current = &dummy;
    for (int value : values) {
        current->next = new ListNode(value);
        current = current->next;
    }
    return dummy.next;
}

TreeNode* buildTree(const vector<optional<int>>& values) {
    if (values.empty() || !values[0].has_value()) return nullptr;
    TreeNode* root = new TreeNode(values[0].value());
    queue<TreeNode*> q;
    q.push(root);
    size_t index = 1;
    while (!q.empty() && index < values.size()) {
        TreeNode* node = q.front();
        q.pop();
        if (index < values.size() && values[index].has_value()) {
            node->left = new TreeNode(values[index].value());
            q.push(node->left);
        }
        index++;
        if (index < values.size() && values[index].has_value()) {
            node->right = new TreeNode(values[index].value());
            q.push(node->right);
        }
        index++;
    }
    return root;
}

void printValue(int value) { cout << value; }
void printValue(double value) { cout << value; }
void printValue(bool value) { cout << (value ? "true" : "false"); }
void printValue(const string& value) { cout << value; }
void printValue(const vector<int>& values) {
    cout << "[";
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ",";
        cout << values[i];
    }
    cout << "]";
}
void printValue(const vector<char>& values) {
    cout << "[";
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ",";
        cout << "\\\"" << values[i] << "\\\"";
    }
    cout << "]";
}
void printValue(ListNode* node) {
    cout << "[";
    bool first = true;
    while (node != nullptr) {
        if (!first) cout << ",";
        cout << node->val;
        first = false;
        node = node->next;
    }
    cout << "]";
}

${code}

int main() {
    ${declarations}
    Solution solution;
    ${callLine}
    return 0;
}
`;
}

function cppType(type) {
  const map = {
    'int[]': 'vector<int>',
    'char[]': 'vector<char>',
    string: 'string',
    int: 'int',
    double: 'double',
    boolean: 'bool',
    ListNode: 'ListNode*',
    TreeNode: 'TreeNode*'
  };
  return map[type] || 'auto';
}

export function buildHarness({ problem, language, code, input }) {
  if (problem.judgeMode !== 'function') {
    return { code, input };
  }

  const parsedInput = parseInput(input);
  if (!parsedInput || Array.isArray(parsedInput)) {
    const error = new Error('Function-style problems require JSON object input');
    error.status = 400;
    throw error;
  }

  if (language === 'python') {
    return { code: pythonHarness({ problem, code, input: parsedInput }), input: '' };
  }

  if (language === 'java') {
    return { code: javaHarness({ problem, code, input: parsedInput }), input: '' };
  }

  if (language === 'cpp') {
    return { code: cppHarness({ problem, code, input: parsedInput }), input: '' };
  }

  return { code, input };
}

function pythonBatchHarness({ problem, code, inputs }) {
  const inputsJson = JSON.stringify(inputs);
  const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
  const firstParam = problem.parameters[0]?.name;
  const resultExpression =
    problem.returnType === 'void'
      ? firstParam
      : `result`;

  return `import json
import sys
import time
from typing import *

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build_list(values):
    dummy = ListNode()
    current = dummy
    for value in values or []:
        current.next = ListNode(value)
        current = current.next
    return dummy.next

def list_to_array(node):
    values = []
    while node is not None:
        values.append(node.val)
        node = node.next
    return values

def build_tree(values):
    if not values:
        return None
    nodes = [None if value is None else TreeNode(value) for value in values]
    child = 1
    for node in nodes:
        if node is not None:
            if child < len(nodes):
                node.left = nodes[child]
                child += 1
            if child < len(nodes):
                node.right = nodes[child]
                child += 1
    return nodes[0]

def serialize_value(value):
    if isinstance(value, ListNode):
        value = list_to_array(value)
    if isinstance(value, str):
        return value
    else:
        return json.dumps(value, separators=(',', ':'))

${code}

_inputs = json.loads(${jsonString(inputsJson)})
_start = time.perf_counter()
for _input in _inputs:
    try:
        ${problem.parameters
          .map((parameter) => {
            if (parameter.type === 'ListNode') {
              return `${parameter.name} = build_list(_input.get(${jsonString(parameter.name)}, []))`;
            }
            if (parameter.type === 'TreeNode') {
              return `${parameter.name} = build_tree(_input.get(${jsonString(parameter.name)}, []))`;
            }
            return `${parameter.name} = _input.get(${jsonString(parameter.name)})`;
          })
          .join('\n        ')}
        ${problem.returnType === 'void' 
          ? `Solution().${problem.functionName}(${callArgs})\n        res_expr = ${firstParam}` 
          : `result = Solution().${problem.functionName}(${callArgs})\n        res_expr = result`}
        sys.stdout.write("__RESULT__:" + serialize_value(res_expr) + "\\n")
    except Exception as e:
        sys.stdout.write("__RESULT__:ERROR:" + str(e) + "\\n")
_end = time.perf_counter()
sys.stderr.write(f"EXECUTION_TIME_MS:{(_end - _start) * 1000:.3f}\\n")
`;
}

function javaBatchHarness({ problem, code, parsedInputs }) {
  const caseBlocks = parsedInputs.map((input, idx) => {
    const declarations = problem.parameters
      .map((parameter) => `${javaType(parameter.type)} ${parameter.name} = ${javaArg(parameter, input[parameter.name])};`)
      .join('\n            ');
    const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
    const firstParam = problem.parameters[0]?.name;
    const callLine = problem.returnType === 'void'
      ? `long startTime = System.nanoTime();\n            solution.${problem.functionName}(${callArgs});\n            long endTime = System.nanoTime();\n            totalTime += (endTime - startTime);\n            System.out.print("__RESULT__:");\n            printValue(${firstParam});`
      : `long startTime = System.nanoTime();\n            var result = solution.${problem.functionName}(${callArgs});\n            long endTime = System.nanoTime();\n            totalTime += (endTime - startTime);\n            System.out.print("__RESULT__:");\n            printValue(result);`;

    return `        {
            ${declarations}
            ${callLine}
            System.out.print("\\n");
        }`;
  }).join('\n');

  const { cleanCode, userImports } = extractJavaImports(code);

  return `${userImports}
import java.util.*;

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

${cleanCode}

public class Main {
    public static void main(String[] args) {
        Solution solution = new Solution();
        long totalTime = 0;
${caseBlocks}
        System.err.println("EXECUTION_TIME_MS:" + (totalTime / 1000000.0));
    }

    static ListNode buildList(int[] values) {
        ListNode dummy = new ListNode();
        ListNode current = dummy;
        for (int value : values) {
            current.next = new ListNode(value);
            current = current.next;
        }
        return dummy.next;
    }

    static TreeNode buildTree(Integer[] values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.add(root);
        int index = 1;
        while (!queue.isEmpty() && index < values.length) {
            TreeNode node = queue.poll();
            if (index < values.length && values[index] != null) {
                node.left = new TreeNode(values[index]);
                queue.add(node.left);
            }
            index++;
            if (index < values.length && values[index] != null) {
                node.right = new TreeNode(values[index]);
                queue.add(node.right);
            }
            index++;
        }
        return root;
    }

    static void printValue(int value) { System.out.print(value); }
    static void printValue(double value) { System.out.print(value); }
    static void printValue(boolean value) { System.out.print(value); }
    static void printValue(String value) { System.out.print(value); }
    static void printValue(int[] values) { System.out.print(toJson(values)); }
    static void printValue(char[] values) { System.out.print(toJson(values)); }
    static void printValue(ListNode node) { System.out.print(toJson(node)); }
    static void printValue(List<?> list) { System.out.print(toJson(list)); }

    static String toJson(int[] values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) out.append(",");
            out.append(values[i]);
        }
        return out.append("]").toString();
    }

    static String toJson(char[] values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) out.append(",");
            out.append("\\\"").append(values[i]).append("\\\"");
        }
        return out.append("]").toString();
    }

    static String toJson(ListNode node) {
        StringBuilder out = new StringBuilder("[");
        boolean first = true;
        while (node != null) {
            if (!first) out.append(",");
            out.append(node.val);
            first = false;
            node = node.next;
        }
        return out.append("]").toString();
    }

    static String toJson(List<?> list) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) out.append(",");
            Object val = list.get(i);
            if (val instanceof Character) {
                out.append("\\\"").append(val).append("\\\"");
            } else {
                out.append(val);
            }
        }
        return out.append("]").toString();
    }
}
`;
}

function cppBatchHarness({ problem, code, parsedInputs }) {
  const caseBlocks = parsedInputs.map((input, idx) => {
    const declarations = problem.parameters
      .map((parameter) => `${cppType(parameter.type)} ${parameter.name} = ${cppArg(parameter, input[parameter.name])};`)
      .join('\n    ');
    const callArgs = problem.parameters.map((parameter) => parameter.name).join(', ');
    const firstParam = problem.parameters[0]?.name;
    const callLine = problem.returnType === 'void'
      ? `auto startTime = chrono::high_resolution_clock::now();\n    solution.${problem.functionName}(${callArgs});\n    auto endTime = chrono::high_resolution_clock::now();\n    totalTime += chrono::duration<double, milli>(endTime - startTime).count();\n    cout << "__RESULT__:";\n    printValue(${firstParam});`
      : `auto startTime = chrono::high_resolution_clock::now();\n    auto result = solution.${problem.functionName}(${callArgs});\n    auto endTime = chrono::high_resolution_clock::now();\n    totalTime += chrono::duration<double, milli>(endTime - startTime).count();\n    cout << "__RESULT__:";\n    printValue(result);`;

    return `    {
    ${declarations}
    ${callLine}
    cout << "\\n";
    }`;
  }).join('\n');

  return `#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

ListNode* buildList(const vector<int>& values) {
    ListNode dummy;
    ListNode* current = &dummy;
    for (int value : values) {
        current->next = new ListNode(value);
        current = current->next;
    }
    return dummy.next;
}

TreeNode* buildTree(const vector<optional<int>>& values) {
    if (values.empty() || !values[0].has_value()) return nullptr;
    TreeNode* root = new TreeNode(values[0].value());
    queue<TreeNode*> q;
    q.push(root);
    size_t index = 1;
    while (!q.empty() && index < values.size()) {
        TreeNode* node = q.front();
        q.pop();
        if (index < values.size() && values[index].has_value()) {
            node->left = new TreeNode(values[index].value());
            q.push(node->left);
        }
        index++;
        if (index < values.size() && values[index].has_value()) {
            node->right = new TreeNode(values[index].value());
            q.push(node->right);
        }
        index++;
    }
    return root;
}

void printValue(int value) { cout << value; }
void printValue(double value) { cout << value; }
void printValue(bool value) { cout << (value ? "true" : "false"); }
void printValue(const string& value) { cout << value; }
void printValue(const vector<int>& values) {
    cout << "[";
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ",";
        cout << values[i];
    }
    cout << "]";
}
void printValue(const vector<char>& values) {
    cout << "[";
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ",";
        cout << "\\\"" << values[i] << "\\\"";
    }
    cout << "]";
}
void printValue(ListNode* node) {
    cout << "[";
    bool first = true;
    while (node != nullptr) {
        if (!first) cout << ",";
        cout << node->val;
        first = false;
        node = node->next;
    }
    cout << "]";
}

${code}

int main() {
    Solution solution;
    double totalTime = 0;
${caseBlocks}
    cerr << "EXECUTION_TIME_MS:" << totalTime << endl;
    return 0;
}
`;
}

export function buildBatchHarness({ problem, language, code, inputs }) {
  if (problem.judgeMode !== 'function') {
    return { code, inputs };
  }

  const parsedInputs = inputs.map(input => {
    try {
      return typeof input === 'string' ? JSON.parse(input) : input;
    } catch (e) {
      return {};
    }
  });

  if (language === 'python') {
    return { code: pythonBatchHarness({ problem, code, inputs: parsedInputs }), input: '' };
  }

  if (language === 'java') {
    return { code: javaBatchHarness({ problem, code, parsedInputs }), input: '' };
  }

  if (language === 'cpp') {
    return { code: cppBatchHarness({ problem, code, parsedInputs }), input: '' };
  }

  return { code, inputs };
}

