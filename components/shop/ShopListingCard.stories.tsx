import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ShopListingCard } from './ShopListingCard'

const meta = {
  title: 'Shop/ShopListingCard',
  component: ShopListingCard,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, maxWidth: 400 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ShopListingCard>

export default meta
type Story = StoryObj<typeof meta>

// Hot deal with high score
export const HotDeal: Story = {
  args: {
    listingId: '1',
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    price: 27999, // $279.99
    originalPrice: 39999, // $399.99
    currency: 'USD',
    condition: 'new',
    retailer: 'Amazon',
    seller: 'Electronics Deals',
    sellerRating: 4.8,
    url: 'https://amazon.com/example',
    imageUrl: 'https://picsum.photos/200',
    inStock: true,
    dealScore: 85,
  },
}

// Good deal
export const GoodDeal: Story = {
  args: {
    listingId: '2',
    title: 'Apple AirPods Pro 2nd Generation with MagSafe Case',
    price: 18999,
    originalPrice: 24999,
    currency: 'USD',
    condition: 'new',
    retailer: 'Best Buy',
    url: 'https://bestbuy.com/example',
    inStock: true,
    dealScore: 68,
  },
}

// Used item on eBay
export const UsedItem: Story = {
  args: {
    listingId: '3',
    title: 'Nintendo Switch OLED Model - White (Used, Excellent Condition)',
    price: 22500,
    originalPrice: 34999,
    currency: 'USD',
    condition: 'used',
    retailer: 'eBay',
    seller: 'GameStation',
    sellerRating: 4.2,
    url: 'https://ebay.com/example',
    inStock: true,
    dealScore: 72,
  },
}

// Refurbished with no image
export const RefurbishedNoImage: Story = {
  args: {
    listingId: '4',
    title: 'MacBook Pro 14" M3 Pro - Refurbished by Apple',
    price: 149900,
    originalPrice: 199900,
    currency: 'USD',
    condition: 'refurbished',
    retailer: 'Apple',
    url: 'https://apple.com/refurbished',
    inStock: true,
    dealScore: 55,
  },
}

// Out of stock
export const OutOfStock: Story = {
  args: {
    listingId: '5',
    title: 'PlayStation 5 Console - Digital Edition',
    price: 39999,
    currency: 'USD',
    condition: 'new',
    retailer: 'Walmart',
    url: 'https://walmart.com/example',
    inStock: false,
    dealScore: 45,
  },
}

// Open box item
export const OpenBox: Story = {
  args: {
    listingId: '6',
    title: 'Samsung 65" OLED 4K Smart TV - Open Box',
    price: 139999,
    originalPrice: 179999,
    currency: 'USD',
    condition: 'open_box',
    retailer: 'Best Buy',
    url: 'https://bestbuy.com/example',
    imageUrl: 'https://picsum.photos/200/200',
    inStock: true,
    dealScore: 78,
  },
}

// Standard deal (low score)
export const StandardDeal: Story = {
  args: {
    listingId: '7',
    title: 'Logitech MX Master 3S Wireless Mouse - Graphite',
    price: 9999,
    currency: 'USD',
    condition: 'new',
    retailer: 'Newegg',
    url: 'https://newegg.com/example',
    inStock: true,
    dealScore: 35,
  },
}

// All variants grid
export const AllVariants: Story = {
  args: {
    listingId: 'all',
    title: 'All Variants Demo',
    price: 9999,
    currency: 'USD',
    condition: 'new',
    retailer: 'Amazon',
    url: 'https://amazon.com',
    inStock: true,
  },
  render: () => (
    <View style={{ gap: 12 }}>
      <ShopListingCard
        listingId="hot"
        title="Sony WH-1000XM5 Wireless Noise Canceling Headphones"
        price={27999}
        originalPrice={39999}
        currency="USD"
        condition="new"
        retailer="Amazon"
        seller="Electronics Deals"
        sellerRating={4.8}
        url="https://amazon.com"
        imageUrl="https://picsum.photos/200"
        inStock={true}
        dealScore={85}
      />
      <ShopListingCard
        listingId="good"
        title="Apple AirPods Pro 2nd Generation"
        price={18999}
        originalPrice={24999}
        currency="USD"
        condition="new"
        retailer="Best Buy"
        url="https://bestbuy.com"
        inStock={true}
        dealScore={68}
      />
      <ShopListingCard
        listingId="used"
        title="Nintendo Switch OLED - Used Excellent"
        price={22500}
        originalPrice={34999}
        currency="USD"
        condition="used"
        retailer="eBay"
        seller="GameStation"
        sellerRating={4.2}
        url="https://ebay.com"
        inStock={true}
        dealScore={72}
      />
      <ShopListingCard
        listingId="oos"
        title="PlayStation 5 Console - Digital Edition"
        price={39999}
        currency="USD"
        condition="new"
        retailer="Walmart"
        url="https://walmart.com"
        inStock={false}
        dealScore={45}
      />
    </View>
  ),
}
