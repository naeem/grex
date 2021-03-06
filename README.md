gRex
====

[Gremlin](https://github.com/tinkerpop/gremlin/wiki) inspired [Rexster Graph Server](https://github.com/tinkerpop/rexster/wiki) client for NodeJS and the browser.

## Dependancies

__batch kibble__ (Rexster extension)

Move the batch-kibble-XXX.jar, located in the modules ``lib`` folder, to the ``/ext`` folder under the rexster server directory.
Add an ``allow`` tag to the database extensions configuration in the rexster.xml file.

    <extensions>
        <allows>
            <allow>tp:gremlin</allow>
            <allow>tp:batch</allow>
        </allows>
    </extensions>

[__Q__](http://documentup.com/kriskowal/q/)

A tool for making and composing asynchronous promises in JavaScript.

## Usage

gRex can be loaded as:

-   a ``<script>`` tag in the browser. Files are located in the browser directory.

    ```
     <script type="text/javascript" src="grex.min.js"></script>
    ```

-   a Node.js and CommonJS module available from NPM as the ``grex`` package

    ```
    $ npm install grex
    ```

    then in Node or the browser

    ```
    var g = require(“grex”);
    ```

-   a RequireJS module

## Connnecting to a database

```
//connect takes options object and returns a Promise
g.connect({ 'database': 'myGraphDB', 
            'host': 'my.host.com',
            'port': 8000 }).then(function(graphDB){

    //once connected the return value is a reference to the graph
    trxn = graphDB.begin();

    t1 = trxn.addVertex({name:'Test1a'});
    t2 = trxn.addVertex({name:'Test2a'});
    trxn.addEdge(t1, t2, 'linked', {name:"ALabel"})

    trxn.commit().then(function(result){
        console.log("Added new vertices successfully. -> ", result);            
    }, function(err) {
        console.error(err)
    });

});
```

## Introduction

gRex tries to implement Gremlin syntax as closely as possible. However, there are some differences.

* All method calls require brackets __()__, even if there are no arguments.
* __Closures__ do not translate to javascript. Closures need to passed in as a string argument to gRex methods. 

    ```
    g.v(1).out().gather("{it.size()}");

    g.v(1).out().ifThenElse("{it.name=='josh'}{it.age}{it.name}");
    ```
* __Comparators__ and __Float__'s are not native javascript Types so need to be passed in as a string to gRex methods. Floats need to be suffixed with a 'f'.

    ```
    g.v(1).outE().has("weight", "T.gte", "0.5f").property("weight")
    ```
* Certain methods cannot be implemented. Such as ``aggregate``, ``store``, ``table``, ``tree`` and ``fill``. These methods require a local object to populate with data, which cannot be done in this environment.

## Getting Started

A good resource to understand the Gremlin API is [GremlinDocs](http://gremlindocs.com/). Below are examples of gremlin and it's equivalent gRex syntax.

###Options

Options specify the location and name of the database.

####host (default: localhost)

Location of Rexster server

####port (default: 8182)

Rexster server port

####graph (default: tinkergraph)

Graph database name

####idRegex (default: false)

This can remain as false, if IDs are number. If IDs are not numbers (i.e. alpha-numeric or string), but still pass parseFloat() test, then idRegex must be set. This property will enable gRex to distinguish between an ID and a float expression.

```
g.setOptions({ host: 'myDomain', graph: 'myOrientdb', idRegex: /^[0-9]+:[0-9]+$/ });
```

__N.B.:__ gRex uses the [Q](http://documentup.com/kriskowal/q/) module to return a Promise when making Ajax calls. All requests are invoked with ``then()`` and the callback is captured by ``then(result, error);``. However, this is not the case when performing Create, Update and Deletes of Vertices or Edges. These actions are batched to reduce the number of calls to the server. In order to send these type of requests a Transaction must be created by calling ``var trxn = g.begin();``. Updates are made against this object. Once all updates are done, invoke ``trxn.commit().then(result, error);`` to commit your changes. See examples below.

__Calls invoked with then()__
```
g.V('name', 'marko').out().then(function(result){console.log(result)}, function(err){console.log(err)});

g.createIndex('my-index', 'Vertex.class').then(function(result){console.log(result)}, function(err){console.log(err)});
```

__Creating, updating or deleting Vetices or Edges. Use commit() to commit changes.__
```
gRex>     var trxn = g.begin();

gRex>     trxn.addVertex(100, {k1:'v1', 'k2':'v2', k3:'v3'});

gRex>     trxn.addVertex(200, {k1:'v1', 'k2':'v2', k3:'v3'});

gRex>     trxn.addEdge(300,100,200,'pal',{weight:'0.75f'})

gRex>     trxn.updateVertex(100, {k2: 'v4'});

gRex>     trxn.removeVertex(100, ['k2', 'k3']);

gRex>     trxn.removeVertex(200);

gRex>     trxn.commit().then(function(result){console.log(result)}, function(err){console.log(err)});
```

## Property Data Types

[Rexster Graph Server](https://github.com/tinkerpop/rexster/wiki) supports the following Property Data Types:

- Strings
- Boolean
- Integer
- Long
- Float
- Double
- List (Array)
- Map

gRex automatically preserves data types. It uses type values obtained from the server, when data is retrieved, to ascertain data types. If a property's data type is unknown, gRex will not try to infer the data type and will simply allow the value to be passed as a string, which is the default behaviour. However, it is possible to provide a type definition to a Transaction, which will then be used to pass type information to the server during a POST.

### Type Definition

When Rexster returns data, it will include Type information, gRex will create a Type definition based on this information to be used in subsequent POST requests. Type definitions can only be generated for Objects that have been retrieved from the server. So, if you are updating or creating a 'Person' object the type definition will only be available if a 'Person' object was previously requested and retrieved from teh server.

Also, if totally new properties need to have a Type definition, so that gRex can understand how to send the information to the server.

A Type definition is an Object and is used globally. For example, if 'age' has been defined as type integer in a 'Person' object, then whenever gRex encounters an 'age' property, regardless of the Object, it will be treated as an integer. Although, if the 'age' property is embedded in another object, then it will need to be explicitly defined.

You are only required to provide a Type definition for properties that are being added.

### Creating a Type Definition

In order to use a Type Definition, you pass in an Object to the Transaction ``begin`` function.

#### Simple Type Definition

A Type definition is an Object Literal. The key is the property name for the Object you are providing a Type definition for and the value is the Type that is being assigned to that property. For example, to define a property as boolean for a key called 'active' you would do the following:

```{ active: 'boolean' }```
OR
```{ active: 'b' }```

This is the similar for all the simple Types.

- Strings = 'string' or 's'
- Boolean = 'boolean' or 'b'
- Integer = 'integer' or 'i'
- Long = 'long' or 'l'
- Float = 'float' or 'f'
- Double = 'double' or 'd'

Complex types, such as ``list`` and ``map`` are a little different.

#### List Type Definition
To define a Type for are List (Array), you simply provide an Array as the value and provide the type name for each item in the array. You will need to know which index a particular Type will be located. Any items added to the array after item[3] will be added as the last Type defined in the array, in this instance the items will be added as integers.

```{ items: ['string', 'string', 'boolean', 'integer'] }```

#### Map Type Definition
Map Type's are simply object literals. To define a map type you pass in objects much the same as defining a simple type above.

```{ address: { number: 'integer', street: 'string', city: 'string'} }```

Both List and Map Types can have embedded list and map types.

* list with embedded map [NB. There is currently a bug for maps embedded in lists]
```{ items: ['string', {age: 'integer'}, 'boolean', 'integer'] }```

* map with embedded list
```{ address: { number: 'integer', street: 'string', city: 'string', occupantNames:['string']} }```

#### Type Definition Usage

To use a Type definition, just pass it to the ``begin`` function of a transaction.

```
var typeDef = { active: 'boolean', 
                items: ['string', 'string', 'boolean', 'integer'], 
                address: { number: 'integer', street: 'string', city: 'string', occupantNames:['string']}
            };
var trxn = new g.begin(typeDef);
```

If there is already a Type definition for a property, the passed in type definition is merged with the existing type definition and takes precedence.

## Examples

For simplicity the callbacks are not included in the examples below.

__Example 1: Basic Transforms__

```
gremlin>  g.V('name', 'marko').out

gRex>     g.V('name', 'marko').out();

gRex>     g.V({name: 'marko'}).out();

gremlin>  g.v(1, 4).out('knows', 'created').in

gRex>     g.v(1, 4).out('knows', 'created').in();

gRex>     g.v([1, 4]).out(['knows', 'created']).in(); 

```

__Example 2: [i]__

```
gremlin>  g.V[0].name

gRex>     g.V().index(0).property('name');
```

__Example 3: [i..j]__

```
gremlin>  g.V[0..<2].name

gRex>     g.V().range('0..<2').property('name');
```

__Example 4: has__

```
gremlin>  g.E.has('weight', T.gt, 0.5f).outV.transform{[it.id,it.age]}

gRex>     g.E().has('weight', 'T.gt', '0.5f').outV().transform('{[it.id,it.age]}');
```

__Example 5: and & or__


```
gremlin>  g.V.and(_().both("knows"), _().both("created"))

gRex>     g.V().and(g._().both("knows"), g._().both("created"))

gremlin>  g.v(1).outE.or(_().has('id', T.eq, "9"), _().has('weight', T.lt, 0.6f))

gRex>     g.v(1).outE().or(g._().has('id', 'T.eq', 9), g._().has('weight', 'T.lt', '0.6f')); 
```

__Example 6: groupBy__

```
gremlin>    g.V.out.groupBy{it.name}{it.in}{it.unique().findAll{i -> i.age > 30}.name}.cap

gRex>       g.V().out().groupBy('{it.name}{it.in}{it.unique().findAll{i -> i.age > 30}.name}').cap()
```

__Example 7: retain__

```
gremlin>  g.V.retain([g.v(1), g.v(2), g.v(3)])

gRex>     g.V().retain([g.v(1), g.v(2), g.v(3)])
```

__Example 8: Create index__

```
gremlin>  g.createIndex("my-index", Vertex.class)

gRex>     g.createIndex("my-index", "Vertex.class")
```

__Example 9: Add to index__

```
gremlin>  g.idx("my-index").put("name", "marko", g.v(1))

gRex>     g.idx("my-index").put("name", "marko", g.v(1))
```

__Example 10: Retrieving indexed Element__

```
gremlin>  g.idx("my-index")[[name:"marko"]]  

gRex>     g.idx("my-index", {name:"marko"});  
```

__Example 11: Drop index__

```
gremlin>  g.dropIndex("my-index", Vertex.class)

gRex>     g.dropIndex("my-index", "Vertex.class")
```

__Example 12: Create, Update, Delete__

```
gRex>     var trxn = g.begin();

gRex>     trxn.addVertex(100, {k1:'v1', 'k2':'v2', k3:'v3'});

gRex>     trxn.addVertex(200, {k1:'v1', 'k2':'v2', k3:'v3'});

gRex>     trxn.addEdge(300,100,200,'pal',{weight:'0.75f'})

gRex>     trxn.updateVertex(100, {k2: 'v4'});

gRex>     trxn.removeVertex(100, ['k2', 'k3']);

gRex>     trxn.removeVertex(200);

gRex>     trxn.commit()
```

__Example 13: Create with database generated id's__

```
var trxn = g.begin();
var v1, v2;

v1 = trxn.addVertex({name:'Frank'});
v2 = trxn.addVertex({name:'Luca'});
trxn.addEdge(v1, v2, 'knows', {since:"2003/06/01"})

v1 = trxn.addVertex({name:'Stephen'});
v2 = trxn.addVertex({name:'James'});
trxn.addEdge(v2, v1, 'knows', {since:"2000/01/01"})

trxn.commit().then(function(result){
    console.log("New vertices -> ", result);            
}, function(err) {
    console.error(err)
}); 

//This will return a JSON object with an array called newVertices. For example:
 
{ success: true,
  newVertices: 
   [ { name: 'Frank', _id: '#8:334', _type: 'vertex' },
     { name: 'Luca', _id: '#8:336', _type: 'vertex' },
     { name: 'Stephen', _id: '#8:335', _type: 'vertex' },
     { name: 'James', _id: '#8:337', _type: 'vertex' } ] 
}
```

__Example 14: Create index__

```
var y = "bob";
var trxn = g.begin();
var vertex = trxn.addVertex({name:y});

trxn.commit().then
    (function(result) {
        console.log("Added a vertex successfully for", y);
        g.createIndex('actor', 'Vertex.class').then
            (function(result){
                g.idx('actor').put('name', y, g.v(vertex._id)).then
                    (function(result){
                    console.log("Index added successfully for", y);
                    }, function(err) {
                        console.log(err)
                    });
            }, function(err) {
                console.log(err)
            });
    }, function(err) {
        console.log(err)
    });
```

## Author

Frank Panetta  - [Follow @entrendipity](https://twitter.com/intent/follow?screen_name=entrendipity)

##License
###The MIT License (MIT)

Copyright (c) 2013 entrendipity pty ltd

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.