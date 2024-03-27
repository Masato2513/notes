# Java语言上的改进

![1582280-20240321155023979-1803943803](images\1582280-20240321155023979-1803943803.png)

## Unnamed Variables & Patterns - JEP 456

匿名变量和模式。当需要但未使用变量声明或嵌套模式时，提高了可读性。这两者都用下划线字符表示。

### **优化：**

##### 1. **捕获开发人员意图，即给定的绑定或Lambda参数未使用，并强制执行该属性以澄清程序并减少错误的机会。**

比如我们可以在循环中这样使用：

```java
static int count(Iterable<Order> orders) {
    int total = 0;
    for (Order _ : orders)    // Unnamed variable
        total++;
    return total;
}
```

或者

```java
for (int i = 0, _ = sideEffect(); i < 10; i++) { ... i ... }
```

或者`while`循环：

```java
while (q.size() >= 3) {
    var x = q.remove();
    var _ = q.remove();       // Unnamed variable
    var _ = q.remove();       // Unnamed variable
    ... new Point(x, 0) ...
}
```

##### 2. **通过识别必须声明但未使用的变量（例如，在捕获子句中）来提高所有代码的可维护性。**

```java
String s = ...
try {
    int i = Integer.parseInt(s);
    ... i ...
} catch (NumberFormatException _) {        // Unnamed variable
    System.out.println("Bad number: " + s);
}
```

多个`catch`：

```java
try { ... }
catch (Exception _) { ... }                // Unnamed variable
catch (Throwable _) { ... }                // Unnamed variable
```

或者这样使用`try...resource`

```java
try (var _ = ScopedContext.acquire()) {    // Unnamed variable
    ... no use of acquired resource ...
}
```

在lamba中我们可以这样使用

```java
...stream.collect(Collectors.toMap(String::toUpperCase,
                                   _ -> "NODATA"))    // Unnamed variable
```

##### 3.  **允许在单个 case 标签中出现多个模式，如果它们都没有声明任何模式变量。**

例如：

```java
switch (ball) {
    case RedBall _   -> process(ball); // Unnamed pattern variable
    case BlueBall _  -> process(ball); // Unnamed pattern variable
    case GreenBall _ -> stopProcessing();  // Unnamed pattern variable
}
```

或者

```java
switch (box) {
    case Box(RedBall _)   -> processBox(box);  // Unnamed pattern variable
    case Box(BlueBall _)  -> processBox(box);  // Unnamed pattern variable
    case Box(GreenBall _) -> stopProcessing(); // Unnamed pattern variable
    case Box(var _)       -> pickAnotherBox(); // Unnamed pattern variable
}
```

通过这种改进允许我们省略名称，未命名的模式变量使得基于类型模式的运行时数据探索在switch语句块以及使用instanceof运算符时，视觉上更加清晰明了。

##### 4. **通过省略不必要的嵌套类型模式来改善记录模式的可读性。**



## Statements before super - JEP 447

构造器中的前置语句。在构造函数中，允许在显式构造函数调用之前出现不引用正在创建的实例的语句。

### **优化**:

##### 1. **为开发人员提供更大的自由度来表达构造函数的行为，从而使当前必须因子化为辅助静态方法、辅助中间构造函数或构造函数参数的逻辑能够更自然地放置。**

有时我们需要验证传递给超类构造函数的参数。虽然我们可以在事后进行参数验证，但这意味着可能会进行不必要的操作。

例如如下

```java
public class PositiveBigInteger extends BigInteger {

    public PositiveBigInteger(long value) {
        super(value);               // Potentially unnecessary work
        if (value <= 0)
            throw new IllegalArgumentException("non-positive value");
    }
}
```

Java22中的做法是声明一个能够快速失败的构造函数，即在调用超类构造函数之前先验证其参数。目前我们只能采用内联方式实现这一点，即借助于辅助静态方法：

```java
public class PositiveBigInteger extends BigInteger {

    public PositiveBigInteger(long value) {
        super(verifyPositive(value));
    }

    private static long verifyPositive(long value) {
        if (value <= 0)
            throw new IllegalArgumentException("non-positive value");
        return value;
    }

}
```

我们还可以将验证逻辑直接包含在构造函数内部，这段代码将会更具可读性。

```java
public class PositiveBigInteger extends BigInteger {

    public PositiveBigInteger(long value) {
        if (value <= 0)
            throw new IllegalArgumentException("non-positive value");
        super(value);
    }
}
```

##### 2. **保留了构造函数在类实例化期间按自上而下顺序运行的现有保证，确保子类构造函数中的代码不能干扰超类实例化。**

为了给超类构造函数提供参数，我们必须执行另外的计算，再次不得不借助于辅助方法：

```java
public class Sub extends Super {

    public Sub(Certificate certificate) {
        super(prepareByteArray(certificate));
    }

    // 辅助方法
    private static byte[] prepareByteArray(Certificate certificate) { 
        var publicKey = certificate.getPublicKey();
        if (publicKey == null) 
            throw new IllegalArgumentException("null certificate");
        return switch (publicKey) {
            case RSAKey rsaKey -> ...
            case DSAPublicKey dsaKey -> ...
            ...
            default -> ...
        };
    }

}
```

超类构造函数接受一个字节数组作为参数，而子类构造函数接受一个`Certificate`对象作为参数。为了满足超类构造函数调用必须为子类构造函数中的第一条语句这一限制，我们声明了一个辅助方法`prepareByteArray`来为此调用准备参数。

如果能够将参数准备代码直接嵌入到构造函数中，这段代码会更具可读性。在Java22中我们可以这么做：

```java
public Sub(Certificate certificate) {
        var publicKey = certificate.getPublicKey();
        if (publicKey == null) 
            throw new IllegalArgumentException("null证书");
        final byte[] byteArray = switch (publicKey) {
            case RSAKey rsaKey -> ... // RSA密钥转换为字节数组
            case DSAPublicKey dsaKey -> ... // DSA公钥转换为字节数组
            ...
            default -> ... // 其他情况处理逻辑
        };
        super(byteArray);
    }
```

##### 3.**不需要对Java虚拟机进行任何更改。这种 Java 语言特性仅依赖于 JVM 当前验证和执行构造函数中显式构造函数调用之前出现的代码的能力。**



## String Templates - JEP 459:

字符串模板。字符串模板通过将文本文字与嵌入表达式和模板处理器相结合，以产生专门的结果，来补充 Java 的现有字符串文字和文本块。

### **优化:**

1. **通过简化在运行时计算值的字符串的表达方式，简化了编写 Java 程序。**
2. **通过使文本和表达式混合的表达更易于阅读，无论文本是否适合单个源行（如字符串文字）或跨越多个源行（如文本块）。**
3. **通过支持模板及其嵌入表达式的验证和转换，改进了由用户提供的值组成字符串并将其传递给其他系统（例如，构建数据库查询）的 Java 程序的安全性。**
4. **保持了灵活性，允许Java库定义在字符串模板中使用的格式化语法**。
5. **简化了接受非Java语言（例如`SQL`、`XML` 和 `JSON`）编写的字符串的 API 的使用。**
6. **允许创建从文本文字和嵌入表达式计算出的非字符串值，而无需通过中间字符串表示转换。**

字符串的模板可以直接在代码中表达，就像注释字符串一样，Java 运行时会自动将特定于模板的规则应用于字符串。从模板编写字符串将使开发人员不必费力地转义每个嵌入表达式、调用`validate()`整个字符串或使用`java.util.ResourceBundle`来查找本地化字符串。

比如我们可以构造一个表示JSON文档的字符串，然后将其提供给JSON解析器

```java
String name    = "Joan Smith";
String phone   = "555-123-4567";
String address = "1 Maple Drive, Anytown";
String json = """
    {
        "name":    "%s",
        "phone":   "%s",
        "address": "%s"
    }
    """.formatted(name, phone, address);

JSONObject doc = JSON.parse(json);
```

字符串的 JSON 结构可以直接在代码中表达，Java运行时会`JSONObject`自动将字符串转换为。无需通过解析器进行手动绕行。
我们使用基于模板的字符串组合机制，我们就可以提高几乎每个Jav 程序的可读性和可靠性。这种功能将提供插值的好处，就像在其他编程语言中看到的那样，但不太容易引入安全漏洞。它还可以减少使用将复杂输入作为字符串的库的繁琐。

我们还可以使用模板`STR`处理器，`STR`是 Java 平台中定义的模板处理器。它通过将模板中的每个嵌入表达式替换为该表达式的（字符串化）值来执行字符串插值。`STR`是`public` `static` `final`自动导入到每个Java源文件中的字段。

```java
// Embedded expressions can be strings
String firstName = "Bill";
String lastName  = "Duck";
String fullName  = STR."\{firstName} \{lastName}";
| "Bill Duck"
String sortName  = STR."\{lastName}, \{firstName}";
| "Duck, Bill"

// Embedded expressions can perform arithmetic
int x = 10, y = 20;
String s = STR."\{x} + \{y} = \{x + y}";
| "10 + 20 = 30"

// Embedded expressions can invoke methods and access fields
String s = STR."You have a \{getOfferType()} waiting for you!";
| "You have a gift waiting for you!"
String t = STR."Access at \{req.date} \{req.time} from \{req.ipAddress}";
| "Access at 2022-03-25 15:34 from 8.8.8.8"
```

模板表达式的模板可以跨越多行源代码，使用类似于文本块的语法。

```java
String title = "My Web Page";
String text  = "Hello, world";
String html = STR."""
        <html>
          <head>
            <title>\{title}</title>
          </head>
          <body>
            <p>\{text}</p>
          </body>
        </html>
        """;
| """
| <html>
|   <head>
|     <title>My Web Page</title>
|   </head>
|   <body>
|     <p>Hello, world</p>
|   </body>
| </html>
| """

String name    = "Joan Smith";
String phone   = "555-123-4567";
String address = "1 Maple Drive, Anytown";
String json = STR."""
    {
        "name":    "\{name}",
        "phone":   "\{phone}",
        "address": "\{address}"
    }
    """;
| """
| {
|     "name":    "Joan Smith",
|     "phone":   "555-123-4567",
|     "address": "1 Maple Drive, Anytown"
| }
| """
```



## Implicitly Declared Classes and Instance Main Methods - JEP 463:

隐式声明的类和实例主方法。这项Java增强引入了隐式声明的类以及实例主方法的功能，允许开发人员在不明确显式声明类的情况下编写类结构，并能够在类实例上直接定义和执行类似于传统`main`方法的入口点。这一特性旨在简化编程模型，特别是对于初学者和小型脚本场景，使得无需了解大型程序设计所需的完整类声明结构也能快速编写可运行的Java代码。

### **优化**:

总体来说可以快速学习Java。

1. 提供了平稳的入门 Java 编程的途径，因此教Java的可以逐渐介绍概念。
2. 帮助初学者以简洁的方式编写基本程序，并随着他们的技能增长而逐渐增加他们的代码。
3. 减少了编写简单程序（如脚本和命令行实用程序）的仪式感。
4. 不会引入单独的 Java 语言初学者方言。
5. 不会引入单独的初学者工具链；初学者的生程序应该使用编译和运行任何Java程序的相同工具。

我们以入门Java的第一行代码`Hello World`为例：

```java
class HelloWorld {
    void main() {
        System.out.println("Hello, World!");
    }
}
```

Java22还可以隐式声明一个类：

```java
void main() {
    System.out.println("Hello, World!");
}
```

还可以这样：

```java
String greeting() { return "Hello, World!"; }

void main() {
    System.out.println(greeting());
}
```

或者，使用字段，如：

```java
String greeting = "Hello, World!";

void main() {
    System.out.println(greeting);
}
```

# Java API库上的改进

## Foreign Function & Memory API - JEP 454:

外部函数和内存API。允许Java程序与Java运行时之外的代码和数据进行交互。通过高效地调用外部函数（即JVM外部的代码）和安全地访问外部内存（即JVM不管理的内存），该API使Java程序能够调用本地库并处理本地数据，而无需JNI的脆弱性和危险性。

**优化**:

1. 生产率 —— 用简洁、可读和纯 Java 的 API 替换原生方法和 Java 本机接口（JNI）的脆弱机制。
2. 性能 —— 提供与 JNI 和 sun.misc.Unsafe 相当甚至更好的外部函数和内存访问开销。
3. 广泛的平台支持 —— 在 JVM 运行的每个平台上启用本地库的发现和调用。
4. 统一性 —— 提供对结构化和非结构化数据的操作方式，无限大小，多种内存类型（例如，本机内存、持久内存和托管堆内存）。
5. 健全性 —— 即使在多个线程之间分配和释放内存时，也保证不会出现使用后释放的错误。
6. 完整性 —— 允许程序执行与本地代码和数据有关的不安全操作，但默认情况下向用户警告此类操作。

Java22提供外部函数和内存API（FFM API）定义类和接口，以便开发者使用他们可以

- 控制外部内存
  （`MemorySegment`、`Arena` 和 `SegmentAllocator`）的分配和释放，
- 操作和访问结构化的外部存储器
  `MemoryLayout`和`VarHandle`
- 调用外部函数
  （`Linker`、`SymbolLookup`、`FunctionDescriptor` 和 `MethodHandle`）。

FFM API在`java.lang.foreign`包中。

## Class-File API - JEP 457:

类文件API。提供了用于解析、生成和转换 Java 类文件的标准 API。

### **优化：**

1. 提供用于处理类文件的API，该类文件跟踪Java虚拟机规范定义的文件格式。class
2. 使JDK组件能够迁移到标准 API，并最终迁移到标准API删除第三方ASM库的JDK内部副本。

**Java22为 Class-File API 采用了以下设计目标和原则**。

- 类文件实体由不可变对象表示
  所有类文件 实体，例如字段、方法、属性、字节码指令、注释等， 由不可变对象表示。这有利于在以下情况下进行可靠共享 正在转换类文件。
- 树结构表示
  类文件具有树结构。一个类 有一些元数据（名称、超类等）和可变数量的字段， 方法和属性。字段和方法本身具有元数据，并进一步 包含属性，包括属性。属性 further 包含指令、异常处理程序等。用于 导航和生成类文件应反映此结构。CodeCode
- 用户驱动的导航
  我们通过类文件树的路径是 由用户选择驱动。如果用户只关心字段上的注释，那么 我们只需要解析结构内部的注释属性;我们不应该研究任何一个类 属性或方法的主体，或字段的其他属性。用户 应该能够处理复合实体，例如方法，无论是作为单个实体 单位或作为其组成部分的流，根据需要。field_info
- 懒惰
  用户驱动的导航可显著提高效率，例如 不解析超过满足用户要求的类文件 需要。如果用户不打算深入研究方法的内容，那么我们 不需要解析比需要更多的结构 下一个类文件元素开始的位置。我们可以懒洋洋地膨胀和缓存， 用户请求时的完整表示形式。method_info
- 统一的流式处理和具体化视图
  与 ASM 一样，我们希望同时支持两者 类文件的流式处理和实例化视图。流视图是 适用于大多数用例，而物化视图更 一般，因为它支持随机访问。我们可以提供一个物化的观点 通过懒惰比 ASM 便宜，这是由不变性实现的。我们可以， 此外，对齐流式视图和实例化视图，以便它们使用通用的 词汇表，可以协调使用，因为每个用例都很方便。
- 紧急转换
  如果类文件解析和生成 API 是 充分对齐，那么转换可以是一个紧急属性，可以 不需要自己的特殊模式或重要的新 API 图面。（ASM实现 这是通过为读者和作者使用通用的访客结构来实现的。如果类， 字段、方法和代码体是可读和可写的，作为 元素，则可以将转换视为对此的平面映射操作 流，由 lambda 定义。
- 细节隐藏
  类文件的许多部分（常量池、引导方法 表、堆栈图等）派生自类文件的其他部分。它 要求用户直接构建这些是没有意义的;这是额外的工作 对于用户来说，并增加了出错的机会。API 将自动 生成与其他实体紧密耦合的实体 添加到类文件中的字段、方法和指令。

`Class-File API` 在 `java.lang.classfile` 包和子包中。 它定义了三个主要抽象：

- 元素是对类文件某部分的一种不可变描述，可能是一个指令、属性、字段、方法，甚至是整个类文件。有些元素，如方法，是复合元素；除了本身是元素外，它们还包含自身的元素，可以作为一个整体处理，也可以进一步分解。
- 每种类型的复合元素都有一个对应的构建器，该构建器拥有特定的构建方法（例如，ClassBuilder::withMethod），并且也是相应元素类型的消费者。
- 最后，变换代表了一个函数，它接收一个元素和一个构建器，并调解如何（如果有的话）将该元素转换为其他元素。

## Stream Gatherers - JEP 461:

流收集器。增强了 Stream API，以支持自定义中间操作。这将允许流管道以不易通过现有内置中间操作实现的方式转换数据。

### **优化：**

- 使流管道更加灵活和富有表现力。
- 尽可能允许自定义中间操作来操作无限大小的流。

流(Stream)::gather(Gatherer) 是一种新的中间流操作，通过应用用户自定义实体——收集器(Gatherer)来处理流中的元素。利用gather操作，我们可以构建高效且适用于并行处理的流，实现几乎所有的中间操作。Stream::gather(Gatherer) 在中间操作中的作用类似于Stream::collect(Collector)在终止操作中的作用。

Gatherer用于表示对流中元素的转换，它是java.util.stream.Gatherer接口的一个实例。Gatherer可以以一对一、一对多、多对一或多对多的方式转换元素。它可以跟踪已处理过的元素以影响后续元素的转换，支持短路操作以将无限流转换为有限流，并能启用并行执行。例如，一个Gatherer可以从输入流中按条件转换一个输入元素为一个输出元素，直到某一条件变为真，此时开始将一个输入元素转换为两个输出元素。

Gatherer由四个协同工作的函数定义：

1. 可选初始化函数提供了在处理流元素过程中维持私有状态的对象。例如，Gatherer可以存储当前元素，以便下次应用时比较新元素和前一个元素，并仅输出两者中较大的那个。实际上，这种Gatherer将两个输入元素转换为一个输出元素。
2. 整合函数整合来自输入流的新元素，可能检查私有状态对象，并可能向输出流发出元素。它还可以在到达输入流末尾之前提前终止处理；例如，一个搜索整数流中最大值的Gatherer在检测到Integer.MAX_VALUE时可以终止处理。
3. 可选组合函数可用于在输入流标记为并行时并行评估Gatherer。若Gatherer不支持并行，则仍可作为并行流管道的一部分，但在评估时将以顺序方式进行。这对于某些本质上有序因而无法并行化的操作场景非常有用。
4. 可选完成函数在没有更多输入元素要消费时被调用。该函数可以检查私有状态对象，并可能发出额外的输出元素。例如，在输入元素中搜索特定元素的Gatherer在其完成器被调用时，若未能找到目标元素，可以通过抛出异常等方式报告失败。

当调用Stream::gather时，执行以下等效步骤：

1. 创建一个Downstream对象，当接收到Gatherer输出类型的元素时，将其传递到管道中的下一阶段。
2. 通过调用其initializer的get()方法获取Gatherer的私有状态对象。
3. 通过调用其integrator()方法获取Gatherer的整合器。
4. 当存在更多输入元素时，调用整合器的integrate(...)方法，传入状态对象、下一个元素和下游对象。若该方法返回false，则终止处理。
5. 获取Gatherer的完成器并使用状态对象和下游对象对其调用。

现有Stream接口中声明的所有中间操作都可以通过调用带有实现该操作的Gatherer的gather方法来实现。例如，对于一个T类型元素的流，Stream::map通过应用一个函数将每个T元素转换为U元素并将其向下传递；这实质上就是一个无状态的一对一Gatherer。另一个例子是Stream::filter，它采用一个谓词决定输入元素是否应向下传递；这只是一个无状态的一对多Gatherer。事实上，从概念上讲，每一个流管道都可以等同于：

```java
source.gather(...).gather(...).gather(...).collect(...)
```

## Structured Concurrency - JEP 462:

结构化并发。简化了并发编程。结构化并发将在不同线程中运行的相关任务组视为单个工作单元，从而简化了错误处理和取消，提高了可靠性并增强了可观察性。

### **优化：**

1. 促进一种并发编程风格，能够消除由于取消和关闭产生的常见风险，例如线程泄露和取消延迟。
2. 提升并发代码的可观测性。

结构化并发API的主要类是`java.util.concurrent`包中的`StructuredTaskScope`类。此类允许开发人员将任务结构化为一组并发子任务，并将它们作为一个整体进行协调管理。子任务通过分别创建新线程（fork）并在之后作为一个整体等待它们完成（join）和可能的情况下作为一个整体取消它们。子任务的成功结果或异常将被父任务聚合并处理。`StructuredTaskScope`确保了子任务的生命周期被限定在一个清晰的词法作用域内，在这个作用域内，任务与其子任务的所有交互，包括分叉（`fork`）、同步（`join`）、取消（`cancellation`）、错误处理和结果合成都在此发生。

使用StructuredTaskScopes实例：

```java
Response handle() throws ExecutionException, InterruptedException {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        Supplier<String>  user  = scope.fork(() -> findUser());
        Supplier<Integer> order = scope.fork(() -> fetchOrder());

        scope.join()            // 同步两个子任务
             .throwIfFailed();  // 并传播错误信息

        // 这里，两个子任务都已经成功，所以组合它们的结果
        return new Response(user.get(), order.get());
    }
}
```

这里理解涉及线程的生命周期变得简单：在所有情况下，它们的生命周期都被限制在一个词法作用域内，即`try-with-resources`语句的主体内。此外，使用`StructuredTaskScope`确保了一系列有价值的特性：

1. 错误处理与短路机制——如果`findUser()`或`fetchOrder()`子任务之一失败，尚未完成的另一个子任务将被取消。（这是由`ShutdownOnFailure`实现的关闭策略管理的，也有可能实现其他策略）。
2. 取消传播——如果在调用`join()`之前或期间执行`handle()`方法的线程被中断，则当线程退出作用域时，两个子任务都将自动取消。
3. 清晰性——上述代码具有清晰的结构：设置子任务，等待它们完成或被取消，然后决定是否成功（并处理已完成子任务的结果）或失败（子任务已经结束，因此无需进一步清理）。
4. 可观测性——如下面所述，线程转储能够清晰地显示任务层级关系，执行`findUser()`和`fetchOrder()`的线程在转储中显示为scope的子线程。



## Scoped Values - JEP 464:

作用域值优化。在线程内和跨线程之间有效共享不可变数据。这个Java增强它旨在提供一种机制，允许开发者在Java应用程序中安全地在线程内部以及跨线程之间共享不可变数据。该特性旨在替代或改善现有的ThreadLocal机制，提供一种更加可控、易于管理和高效的解决方案，尤其是在涉及大规模并发处理和跨层数据传递场景时。通过范围值，开发人员可以更好地组织和管理在特定作用域内有效的变量，同时确保资源的有效利用和数据的安全共享。

### **优化：**

- 易用性 — 理解数据流应当轻松直观。
- 可理解性 — 共享数据的生命周期可以从代码的语法结构中清晰可见。
- 健壮性 — 调用者共享的数据只能被合法的被调用者获取。
- 性能 — 数据能够有效地在大量线程间高效共享。

作用域值是一种容器对象，允许方法在同一个线程内安全高效地将其数据值与直接和间接的被调用者共享，同时也能与子线程共享，而无需依赖方法参数。它是一个类型为`ScopedValue`的变量，通常被声明为`final static`字段，并设置为`private`访问权限，以防止其他类的代码直接访问。

类似线程局部变量，作用域值关联了多个值，每个线程对应一个。具体使用的值取决于哪个线程调用了它的方法。不同于线程局部变量，范围限定值只被写入一次，并且在线程执行期间只能在一定时间段内可用。

作用域值的使用如下所示。一些代码调用`ScopedValue.where`，提供一个范围限定值及其要绑定的对象。调用run方法会绑定该范围限定值，为当前线程提供一个特定的副本，然后执行作为参数传递的`lambda`表达式。在run方法执行期间，`lambda`表达式或从中直接或间接调用的任何方法，都可以通过值的`get()`方法读取范围限定值。当run方法执行完毕后，该绑定关系会被销毁。

```java
final static ScopedValue<...> NAME = ScopedValue.newInstance();

// 在某个方法中
ScopedValue.where(NAME, <value>)
           .run(() -> { ... NAME.get() ... 调用方法 ... });

// 在lambda表达式中直接或间接调用的方法中
... NAME.get() ...
```

代码的结构明确了线程可以读取其作用域值副本的时间段。这个有限的生命周期极大地简化了对线程行为的推理。数据从调用者单向传输至直接和间接的被调用者，一眼就能看出。不存在能让远端代码随时改变范围限定值的set方法。这也有助于提高性能：无论调用者和被调用者的栈距离如何，通过get()方法读取作用域值的速度常常与读取局部变量一样快。

## Vector API - JEP 460:

矢量API。一个能够在支持的CPU架构上运行时可靠编译为最优矢量指令的API，从而实现优于等效标量计算的性能。
本JEP提议在JDK 22中重新孵化该API，相比于JDK 21版本，API进行了些许增强。实现内容包括bug修复和性能优化。主要变更如下：
支持通过任意原始元素类型的数组支持的堆内存`MemorySegments`进行矢量访问。在此之前，访问仅限于由字节数组支持的堆内存`MemorySegments`。

### **优化：**

1. 清晰简洁的API
   API应该能够清晰简洁地表述一系列由循环内矢量操作序列组成的各种矢量计算，可能还包括控制流程。应支持针对矢量大小或每矢量的通道数进行泛型表达，从而使这类计算能够在支持不同矢量大小的硬件之间移植。
2. 平台无关性
   API应独立于CPU架构，支持在多种支持矢量指令的架构上实现。按照Java API的一贯原则，在平台优化和可移植性产生冲突时，我们会倾向于使API更具可移植性，即使这意味着某些特定于平台的惯用法无法在便携代码中表达。
3. 在x64和AArch64架构上的可靠运行时编译和高性能
   在具备能力的x64架构上，Java运行时环境，特别是HotSpot C2编译器，应将矢量操作编译为相应的高效矢量指令，比如Streaming SIMD Extensions (SSE) 和Advanced Vector Extensions (AVX)支持的那些指令。开发者应有信心他们所表达的矢量操作将可靠地紧密映射到相关的矢量指令上。在具备能力的ARM AArch64架构上，C2同样会将矢量操作编译为NEON和SVE支持的矢量指令。
4. 优雅降级
   有时矢量计算可能无法完全在运行时表述为矢量指令序列，可能是因为架构不支持所需的某些指令。在这种情况下，Vector API实现应能够优雅降级并仍然正常运作。这可能包括在矢量计算无法高效编译为矢量指令时发出警告。在不支持矢量的平台上，优雅降级将生成与手动展开循环相竞争的代码，其中展开因子为所选矢量的通道数。
5. 与`Project Valhalla`项目的契合
   `Vector API`的长期目标是利用`Project Valhalla`对Java对象模型的增强功能。主要来说，这意味着将`Vector API`当前基于值的类更改为值类，以便程序能够处理值对象，即缺乏对象标识性的类实例。因此，`Vector API`将在多个版本中孵化，直至`Project Valhalla`的必要特性作为预览功能可用。一旦这些Valhalla特性可用，我们将调整Vector API及其实现以使用这些特性，并将`Vector API`本身提升为预览功能。

向量由抽象类`Vector<E>`表示。类型变量E被实例化为矢量覆盖的标量基本整数或浮点元素类型的装箱类型。一个向量还具有形状属性，该属性定义了矢量的大小（以位为单位）。当矢量计算由`HotSpot C2`编译器编译时，向量的形状决定了`Vector<E>`实例如何映射到硬件矢量寄存器。向量的长度，即车道数或元素个数，等于矢量大小除以元素大小。

支持的一系列元素类型（E）包括Byte、Short、Integer、Long、Float和Double，分别对应于标量基本类型byte、short、int、long、float和double。

支持的一系列形状对应于64位、128位、256位和512位的矢量大小，以及最大位数。512位形状可以将字节打包成64个车道，或者将整数打包成16个车道，具有这种形状的矢量可以一次性操作64个字节或16个整数。max-bits形状支持当前架构的最大矢量尺寸，这使得API能够支持`ARM SVE`平台，该平台实现可以支持从128位到2048位，以128位为增量的任何固定尺寸。

# 性能上的改进

## Regional Pinning for G1 - JEP 423:

区域固定。通过在G1中实现区域固定（regional pinning），从而在Java Native Interface (JNI) 临界区域内不需要禁用垃圾收集，以此来减少延迟。

### **优化：**

1. 不会因JNI临界区域导致线程停滞。
2. 不会因JNI临界区域而导致垃圾收集启动时增加额外延迟。
3. 当没有JNI临界区域活动时，GC暂停时间不会出现倒退。
4. 当JNI临界区域活动时，GC暂停时间只会有最小程度的倒退。

# 工具类

## Launch Multi-File Source-Code Programs - JEP 458:

启动多文件源代码程序。允许用户在不首先编译程序的情况下运行由多个 Java 源代码文件提供的程序。

### **优化：**

1. 通过使从小型程序向大型程序的过渡更加渐进，使开发人员能够选择何时以及何时费力地配置构建工具，提高了开发人员的生产力。

Java22增强了Java启动器的源文件模式，使其能够运行以多份Java源代码文件形式提供的程序。

举例来说，假设一个目录包含了两个文件：Prog.java和Helper.java，每个文件各声明一个类：

```java
// Prog.java
class Prog {
    public static void main(String[] args) { Helper.run(); }
}

// Helper.java
class Helper {
    static void run() { System.out.println("Hello!"); }
}
```

运行命令`java Prog.java`将会在内存中编译Prog类并调用其main方法。由于Prog类中的代码引用了Helper类，启动器会在文件系统中查找Helper.java文件，并在内存中编译Helper类。如果Helper类中的代码又引用了其他类，例如HelperAux类，那么启动器还会找到HelperAux.java并对其进行编译。

当不同.java文件中的类互相引用时，Java启动器并不保证按照特定顺序或时间点编译这些.java文件。例如，启动器可能先编译Helper.java再编译Prog.java。有些代码可能在程序开始执行前就已经被编译，而其他代码可能在需要时才懒加载编译。

只有被程序引用到的类所在的.java文件才会被编译。这样一来，开发者可以在尝试新版本代码时不必担心旧版本会被意外编译。例如，假设目录中还包含OldProg.java文件，其中包含Progr类的一个旧版本，该版本期望Helper类有一个名为go的方法而不是run方法。当运行Prog.java时，存在包含潜在错误的OldProg.java文件并不会影响程序执行。

一个.java文件中可以声明多个类，且会被一起编译。在一个.java文件中共声明的类优先于在其他.java文件中声明的类。例如，假设上面的Prog.java文件扩展后也在其中声明了Helper类，尽管Helper.java文件中已有一个同名类。当Prog.java中的代码引用Helper时，会使用在Prog.java中共同声明的那个类；启动器不会去搜索Helper.java文件。

源代码程序中禁止重复的类声明。也就是说，同一个.java文件内或构成程序的不同.java文件之间的类声明，如果名称相同，则不允许存在。假设经过编辑后，Prog.java和Helper.java最终变成以下形式，其中类Aux意外地在两个文件中都被声明：

```java
// Prog.java
class Prog {
    public static void main(String[] args) { Helper.run(); Aux.cleanup(); }
}
class Aux {
    static void cleanup() { ... }
}

// Helper.java
class Helper {
    static void run() { ... }
}
class Aux {
    static void cleanup() { ... }
}
```

运行命令`java Prog.java`会编译Prog.java中的Prog和Aux类，调用Prog类的main方法，然后——由于main方法引用了Helper——查找并编译Helper.java中的Helper和Aux类。Helper.java中对Aux类的重复声明是不允许的，所以程序会停止运行，启动器报告错误。

当通过Java启动器传递单个.java文件名称时，就会触发其源文件模式。如果提供了额外的文件名，它们会成为主方法的参数。例如，运行命令`java Prog.java Helper.java`会导致字符串数组"Helper.java"作为参数传给Prog类的main方法。

# 其他特性

除了JEP中描述的更改之外，发行说明中还列出了许多较小的更新，这些更新对许多应用程序开发者有重要意义。其中包括废弃过时的API和移除先前已经弃用的API。

1. 向keytool和jarsigner添加了更多算法。
2. 垃圾回收器吞吐量方面的改进，特别是在“年轻代”垃圾回收方面。
3. 改进了系统模块描述符的版本报告功能。
4. 提高了对原生代码“等待”处理选项的完善。
5. Unicode通用区域数据仓库已更新至版本44。
6. 支持从字节码加载的类型上的类型注解。
7. ForkJoinPool和ForkJoinTask现在能更好地处理不可中断任务。
8. 对客户端与服务器TLS连接属性配置提供了更多的灵活性。
9. 提高了对原生内存跟踪的功能，包括峰值使用情况的报告。
10. 最后，如同所有特性发布版一样，JDK 22包含了数百项性能、稳定性和安全性更新，包括适应底层操作系统和固件更新及标准变化。用户和应用程序开发者通常在不知不觉中受益于这些变化。

最后，JDK 22是通过六个月的发布节奏按时交付的13th功能版本。由于预期改进源源不断，这种程度的可预测性使开发人员能够轻松管理创新的采用。Oracle 不会为 JDK 22 提供长期支持，在 2023 年 9 月之前提供更新，之后它将被 Oracle JDK 23 取代。最近的长期维护版本是Java 21。

![1582280-20240321155023717-1048324512](images\1582280-20240321155023717-1048324512.png)

