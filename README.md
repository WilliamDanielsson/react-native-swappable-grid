# react-native-swappable-grid

A powerful React Native component for creating draggable, swappable grid layouts with smooth animations, reordering, and delete functionality.

## Features

- 🎯 **Drag & Drop**: Long press to drag and reorder items in a grid layout
- 📐 **Flexible Layout**: Automatic column calculation or fixed number of columns
- 🎨 **Smooth Animations**: Optional wiggle animation during drag mode
- 🗑️ **Delete Support**: Built-in hold-to-delete or custom delete component
- ➕ **Trailing Components**: Support for additional components (e.g., "Add" button)
- 📜 **Auto-scroll**: Automatic scrolling when dragging near edges
- 🔄 **Order Tracking**: Callbacks for order changes and drag end events
- ⚡ **Performance**: Built with React Native Reanimated and Gesture Handler for 60fps animations

## Installation

```bash
npm install react-native-swappable-grid
# or
yarn add react-native-swappable-grid
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install react react-native react-native-gesture-handler react-native-reanimated
# or
yarn add react react-native react-native-gesture-handler react-native-reanimated
```

**Important**: Make sure to follow the setup instructions for:

- [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/docs/installation)
- [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/docs/installation)

## Basic Usage

```tsx
import React, { useState } from "react";
import { View, Text } from "react-native";
import { SwappableGrid } from "react-native-swappable-grid";

const MyComponent = () => {
  const [items, setItems] = useState([
    { id: "1", title: "Item 1" },
    { id: "2", title: "Item 2" },
    { id: "3", title: "Item 3" },
  ]);

  return (
    <SwappableGrid
      itemWidth={100}
      itemHeight={100}
      numColumns={3}
      gap={8}
      onOrderChange={(keys) => {
        // Reorder items based on new key order
        const newOrder = keys
          .map((key) => items.find((item) => item.id === key))
          .filter(Boolean);
        setItems(newOrder);
      }}
    >
      {items.map((item) => (
        <View
          key={item.id}
          style={{ backgroundColor: "#ccc", borderRadius: 8 }}
        >
          <Text>{item.title}</Text>
        </View>
      ))}
    </SwappableGrid>
  );
};
```

## API Reference

### SwappableGrid Props

| Prop                     | Type                                    | Required | Default | Description                                                                                                |
| ------------------------ | --------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `children`               | `ReactNode`                             | ✅       | -       | The child components to render in the grid. Each child should have a unique key.                           |
| `itemWidth`              | `number`                                | ✅       | -       | Width of each grid item in pixels                                                                          |
| `itemHeight`             | `number`                                | ✅       | -       | Height of each grid item in pixels                                                                         |
| `gap`                    | `number`                                | ❌       | `8`     | Gap between grid items in pixels                                                                           |
| `containerPadding`       | `number`                                | ❌       | `8`     | Padding around the container in pixels                                                                     |
| `longPressMs`            | `number`                                | ❌       | `300`   | Duration in milliseconds to hold before drag starts                                                        |
| `numColumns`             | `number`                                | ❌       | Auto    | Number of columns in the grid. If not provided, will be calculated automatically based on container width  |
| `wiggle`                 | `{ duration: number; degrees: number }` | ❌       | -       | Wiggle animation configuration when items are in drag mode or delete mode                                  |
| `onDragEnd`              | `(ordered: ChildNode[]) => void`        | ❌       | -       | Callback fired when drag ends, providing the ordered array of child nodes                                  |
| `onOrderChange`          | `(keys: string[]) => void`              | ❌       | -       | Callback fired when the order changes, providing an array of keys in the new order                         |
| `onDelete`               | `(key: string) => void`                 | ❌       | -       | Callback fired when an item is deleted, providing the key of the deleted item                              |
| `dragSizeIncreaseFactor` | `number`                                | ❌       | `1.06`  | Factor by which the dragged item scales up                                                                 |
| `scrollSpeed`            | `number`                                | ❌       | `10`    | Speed of auto-scrolling when dragging near edges                                                           |
| `scrollThreshold`        | `number`                                | ❌       | `100`   | Distance from edge in pixels that triggers auto-scroll                                                     |
| `style`                  | `StyleProp<ViewStyle>`                  | ❌       | -       | Custom style for the ScrollView container                                                                  |
| `trailingComponent`      | `ReactNode`                             | ❌       | -       | Component to render after all grid items (e.g., an "Add" button)                                           |
| `deleteComponent`        | `ReactNode`                             | ❌       | -       | Component to render as a delete target (shown when dragging). If provided, disables hold-to-delete feature |
| `deleteComponentStyle`   | `StyleProp<ViewStyle>`                  | ❌       | -       | Custom style for the delete component. If provided, allows custom positioning                              |
| `reverse`                | `boolean`                               | ❌       | `false` | If true, reverses the order of items (right-to-left, bottom-to-top)                                        |

### SwappableGridRef

The component can be used with a ref to access imperative methods:

```tsx
const gridRef = useRef<SwappableGridRef>(null);

<SwappableGrid ref={gridRef} ... />

// Cancel delete mode programmatically
gridRef.current?.cancelDeleteMode();
```

| Method               | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `cancelDeleteMode()` | Cancels the delete mode if any item is currently in delete mode |

## Examples

### With Wiggle Animation

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  numColumns={3}
  wiggle={{ duration: 200, degrees: 3 }}
  onOrderChange={(keys) => console.log("New order:", keys)}
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

### With Delete Functionality (Hold-to-Delete)

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  numColumns={3}
  onDelete={(key) => {
    setItems(items.filter((item) => item.id !== key));
  }}
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

### With Delete Component

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  numColumns={3}
  deleteComponent={
    <View
      style={{
        backgroundColor: "red",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white" }}>Drop to Delete</Text>
    </View>
  }
  onDelete={(key) => {
    setItems(items.filter((item) => item.id !== key));
  }}
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

### With Trailing Component (Add Button)

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  numColumns={3}
  trailingComponent={
    <Pressable
      onPress={() => addNewItem()}
      style={{
        backgroundColor: "#007AFF",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white", fontSize: 24 }}>+</Text>
    </Pressable>
  }
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

### Auto-calculated Columns

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  gap={12}
  containerPadding={16}
  // numColumns not provided - will be calculated automatically
  onOrderChange={(keys) => console.log("New order:", keys)}
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

### Custom Delete Component Position

```tsx
<SwappableGrid
  itemWidth={100}
  itemHeight={100}
  numColumns={3}
  deleteComponent={
    <View style={{ backgroundColor: "red", borderRadius: 8 }}>
      <Text>Delete</Text>
    </View>
  }
  deleteComponentStyle={{
    position: "absolute",
    top: 20,
    right: 20,
    width: 100,
    height: 100,
  }}
  onDelete={(key) => {
    setItems(items.filter((item) => item.id !== key));
  }}
>
  {items.map((item) => (
    <View key={item.id}>{item.content}</View>
  ))}
</SwappableGrid>
```

## How It Works

1. **Long Press**: Hold an item for `longPressMs` milliseconds to enter drag mode
2. **Drag**: Move the item to swap positions with other items
3. **Auto-scroll**: When dragging near edges, the grid automatically scrolls
4. **Delete**:
   - **Hold-to-delete**: Hold an item still for 1 second to enter delete mode (shows delete button)
   - **Delete component**: Drag an item to the delete component to delete it
5. **Order Change**: The `onOrderChange` callback fires whenever items are reordered

## Notes

- Each child component **must** have a unique `key` prop
- The component uses `react-native-reanimated` for smooth 60fps animations
- When `deleteComponent` is provided, the hold-to-delete feature is automatically disabled
- The trailing component is positioned after all grid items
- The delete component appears only when dragging (if provided)

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
