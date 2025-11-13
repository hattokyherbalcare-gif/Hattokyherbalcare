import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  signInAnonymously,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  setLogLevel, 
  doc, 
  setDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  ShoppingCart, Package, Send, MapPin, Phone, User, Banknote, List, X, Loader, 
  Shield, PlusCircle, LayoutList, CheckCircle, Archive, LogIn, LogOut 
} from 'lucide-react';

// --- Configuration (Easily Changeable) ---
const BUSINESS_NAME = "Hattoky Herbal Care";
const YOUR_WHATSAPP_NUMBER = "2349152383128"; 
const PRIMARY_COLOR = 'indigo';
const CURRENCY_SYMBOL = '₦'; 

// --- CRITICAL ADMIN CONFIGURATION ---
const ADMIN_USER_ID = "KD63qdJ0MkT4G3VSigQ2yUJBkjH2";

// --- (SMART DEPLOYMENT FIX) ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config !== "{}") {
    console.log("Using __firebase_config");
    try {
      const config = JSON.parse(__firebase_config);
      if (config.apiKey) return config;
    } catch (e) {
      console.error("Failed to parse __firebase_config", e);
    }
  }
  if (import.meta.env.VITE_API_KEY) {
    console.log("Using VITE environment variables");
    return {
      apiKey: import.meta.env.VITE_API_KEY,
      authDomain: import.meta.env.VITE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_APP_ID
    };
  }
  console.warn("Firebase config not found, using fallback.");
  return {};
};

const firebaseConfig = getFirebaseConfig();
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = import.meta.env.VITE_APP_ID || (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');
// --- (END OF SMART FIX) ---

setLogLevel('debug'); 

const generateOrderId = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
};

// --- Custom Components ---
const Modal = ({ isOpen, title, children, onClose, action, actionText }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className={`bg-white rounded-xl shadow-2xl p-6 w-full max-w-md transform transition-all`}>
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                {children}
                {(action && actionText) && (
                    <button onClick={action} className={`mt-4 w-full bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600`}>
                        {actionText}
                    </button>
                )}
            </div>
        </div>
    );
};

// --- Main Application Component ---
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true); 
  const [view, setView] = useState('PRODUCTS'); 
  const [formData, setFormData] = useState({ name: '', phone: '', location: '', notes: '' });
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState(null);
  const [modalContent, setModalContent] = useState(null);

  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const IS_ADMIN = useMemo(() => user && user.uid === ADMIN_USER_ID, [user]);

  // 1. Firebase Initialization and Authentication Listener
  useEffect(() => {
    try {
      if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);

        setDb(firestore);
        setAuth(authInstance);

        const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
          if (currentUser) {
            setUser(currentUser);
          } else {
            setUser(null);
          }
          setLoading(false); 
        });

        const authenticate = async () => {
          if (initialAuthToken) { 
            await signInWithCustomToken(authInstance, initialAuthToken);
          } else { 
            if (!authInstance.currentUser) {
              await signInAnonymously(authInstance);
            }
          }
        };

        authenticate().catch(err => {
          console.error("Anonymous Auth Error:", err);
          setError("Failed to connect to the store's authentication.");
          setLoading(false);
        });

        return () => unsubscribe();

      } else {
        console.warn("Firebase configuration is missing.");
        setError("Firebase config is missing. App cannot load.");
        setLoading(false);
      }
    } catch (e) {
      console.error("Firebase Init Error:", e);
      setError("Failed to initialize Firebase services.");
      setLoading(false);
    }
  }, []); 

  // 2. Fetch Products and Orders (Real-time listener)
  useEffect(() => {
    if (!db || !user) return; 

    const productsPath = `artifacts/${appId}/public/data/products`;
    const productsQuery = query(collection(db, productsPath), orderBy("createdAt", "desc"));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const fetchedProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(fetchedProducts);
    }, (err) => {
      console.error("Firestore Products Fetch Error:", err);
      setError("Failed to load products from the database.");
    });
    
    const ordersPath = `artifacts/${appId}/public/data/orders`;
    const ordersQuery = query(collection(db, ordersPath), orderBy("placedAt", "desc"));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(fetchedOrders);
    }, (err) => {
      console.error("Firestore Orders Fetch Error:", err);
    });

    return () => {
        unsubscribeProducts();
        unsubscribeOrders();
    }
  }, [db, user]); 


  // --- Cart Management Functions ---
  const handleAddToCart = useCallback((product) => {
    if (product.stock <= 0) {
        setModalContent({
            title: "Out of Stock",
            message: `${product.name} is currently sold out.`,
            onClose: () => setModalContent(null)
        });
        return;
    }

    setCartItems(prev => {
      const existingItem = prev.find(item => item.id === product.id);
      if (existingItem) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setModalContent({
        title: "Item Added",
        message: `${product.name} added to cart!`,
        onClose: () => setModalContent(null)
    });
  }, []);

  const handleUpdateQuantity = useCallback((id, delta) => {
    setCartItems(prev => {
      const existingItem = prev.find(item => item.id === id);
      if (!existingItem) return prev;

      const newQuantity = existingItem.quantity + delta;

      if (newQuantity <= 0) {
        return prev.filter(item => item.id !== id);
      }
      return prev.map(item =>
        item.id === id ? { ...item, quantity: newQuantity } : item
      );
    });
  }, []);

  const cartTotal = useMemo(() => cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cartItems]);

  // --- Order Submission ---
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cartItems.length === 0) {
        setModalContent({ title: "Cart Empty", message: "Your cart is empty. Please add items before placing an order.", onClose: () => setModalContent(null) });
        return;
    }

    setLoading(true);
    setError(null);
    const newOrderId = generateOrderId();
    const currentOrderId = orderId || newOrderId; 

    const orderData = {
      orderId: currentOrderId,
      customerDetails: formData,
      items: cartItems.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: cartTotal,
      status: 'PENDING',
      placedAt: serverTimestamp(),
      userId: user ? user.uid : 'guest-error',
    };

    try {
      if (db) {
        const ordersPath = `artifacts/${appId}/public/data/orders`;
        await addDoc(collection(db, ordersPath), orderData);
      } 

      const itemsList = cartItems.map(item => `\n- ${item.name} x ${item.quantity} (@ ${CURRENCY_SYMBOL}${item.price.toFixed(2)})`).join('');
      const message = `
Hello! I am placing an order from ${BUSINESS_NAME}.

*Order ID:* ${currentOrderId}
*Total Amount:* ${CURRENCY_SYMBOL}${cartTotal.toFixed(2)}
*Customer:* ${formData.name}
*Delivery Location:* ${formData.location}

*Items Ordered:*${itemsList}

I will proceed with payment using the Order ID as reference. Please confirm availability!
      `.trim();

      const waLink = `https://wa.me/${YOUR_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      window.open(waLink, '_blank');

      setModalContent({
          title: "Order Placed Successfully!",
          message: `Your order #${currentOrderId} has been saved. Your WhatsApp will now open so you can send the final details. Use the Order ID as reference!`,
          actionText: "Got It",
          action: () => {
            setModalContent(null);
            setCartItems([]);
            setFormData({ name: '', phone: '', location: '', notes: '' });
            setView('PRODUCTS');
          },
          onClose: () => setModalContent(null)
      });

    } catch (err) {
      console.error("Order Placement Error:", err);
      setError("An error occurred while placing the order.");
    } finally {
      setLoading(false);
    }
  };

  // --- Admin Logic ---
  const [productForm, setProductForm] = useState({ name: '', price: '', imageUrl: '', description: '', initialStock: '' });
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const orderStatuses = ['PENDING', 'PAID', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
  const [stockInputs, setStockInputs] = useState({});

  const handleProductFormChange = (e) => {
    const { name, value } = e.target;
    setProductForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!db) {
        setError("Database is not connected.");
        return;
    }

    const priceValue = parseFloat(productForm.price);
    if (isNaN(priceValue) || priceValue <= 0) {
        setModalContent({ title: "Input Error", message: "Price must be a valid number greater than zero.", onClose: () => setModalContent(null) });
        return;
    }

    const stockValue = parseInt(productForm.initialStock, 10);
    if (isNaN(stockValue) || stockValue < 0) {
        setModalContent({ title: "Input Error", message: "Stock Quantity must be a valid number (0 or greater).", onClose: () => setModalContent(null) });
        return;
    }

    setIsSubmittingProduct(true);
    const newProduct = {
        name: productForm.name,
        price: priceValue,
        imageUrl: productForm.imageUrl || '',
        description: productForm.description || '',
        createdAt: serverTimestamp(),
        stock: stockValue,
    };

    try {
        const productsPath = `artifacts/${appId}/public/data/products`;
        await addDoc(collection(db, productsPath), newProduct);
        setProductForm({ name: '', price: '', imageUrl: '', description: '', initialStock: '' });
        setModalContent({ title: "Success", message: `${newProduct.name} added to the store!`, onClose: () => setModalContent(null) });

    } catch (err) {
        console.error("Error adding product:", err);
        setError("Failed to add product to database.");
    } finally {
        setIsSubmittingProduct(false);
    }
  };

  const handleStockInputChange = (productId, value) => {
    setStockInputs(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleUpdateStock = async (productId) => {
    if (!db) {
        setError("Database is not connected.");
        return;
    }

    const newStockValue = stockInputs[productId];
    const newStock = parseInt(newStockValue, 10);

    if (isNaN(newStock) || newStock < 0) {
        setModalContent({ title: "Input Error", message: "Stock must be a valid number (0 or greater).", onClose: () => setModalContent(null) });
        return;
    }

    try {
        const productsPath = `artifacts/${appId}/public/data/products`;
        const productRef = doc(db, productsPath, productId);
        await setDoc(productRef, { stock: newStock }, { merge: true });
        
        setModalContent({ title: "Success", message: `Stock updated to ${newStock}!`, onClose: () => setModalContent(null) });
        
        setStockInputs(prev => {
          const newInputs = { ...prev };
          delete newInputs[productId];
          return newInputs;
        });

    } catch (err) {
        console.error("Error updating stock:", err);
        setError("Failed to update stock.");
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    if (!db || !IS_ADMIN) return;

    try {
        const ordersPath = `artifacts/${appId}/public/data/orders`;
        const orderRef = doc(db, ordersPath, orderId);
        await setDoc(orderRef, { status: newStatus }, { merge: true });
    } catch (err) { 
        console.error("Error updating order status:", err);
        setError("Failed to update order status.");
    }
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!auth) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setShowLogin(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      console.error("Login Error:", err);
      setLoginError("Failed to log in. Please check your email and password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    
    if (view === 'ADMIN') {
        setView('PRODUCTS');
    }
    await signOut(auth);
    await signInAnonymously(auth);
  };

  // --- Rendering Components ---

  const renderLoginModal = () => (
    <Modal isOpen={showLogin} title="Admin Login" onClose={() => setShowLogin(false)}>
        <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required />
            <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required />
            {loginError && (<p className="text-red-500 text-sm">{loginError}</p>)}
            <button type="submit" disabled={isLoggingIn} className={`w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center space-x-2 disabled:opacity-50`}>
                {isLoggingIn ? <Loader className="animate-spin h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                <span>{isLoggingIn ? 'Logging In...' : 'Login'}</span>
            </button>
        </form>
    </Modal>
  );

  const renderAdminPanel = () => (
    <div className="max-w-4xl mx-auto">
        <h2 className={`text-3xl font-extrabold text-indigo-700 mb-8 flex items-center`}>
            <Shield className="mr-3 h-7 w-7" /> Admin Dashboard
        </h2>

        {/* Product Submission */}
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 mb-10">
            <h3 className={`text-2xl font-semibold border-b pb-3 mb-4 text-indigo-600 flex items-center`}>
                <PlusCircle className="mr-2 h-6 w-6" /> Add New Product
            </h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
                <input type="text" name="name" placeholder="Product Name" value={productForm.name} onChange={handleProductFormChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required />
                <input type="number" name="price" placeholder={`Price (e.g., 85.50) in ${CURRENCY_SYMBOL}`} value={productForm.price} onChange={handleProductFormChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" step="0.01" required />
                <input type="number" name="initialStock" placeholder="Initial Stock Quantity (e.g., 50)" value={productForm.initialStock} onChange={handleProductFormChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" step="1" min="0" required />
                <input type="url" name="imageUrl" placeholder="Image URL (from Cloudinary/Storage)" value={productForm.imageUrl} onChange={handleProductFormChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                <textarea name="description" placeholder="Short Product Description" value={productForm.description} onChange={handleProductFormChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" rows="2" required />
                <button type="submit" disabled={isSubmittingProduct} className={`w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl flex items-center justify-center space-x-2 disabled:opacity-50`}>
                    {isSubmittingProduct ? <Loader className="animate-spin h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                    <span>{isSubmittingProduct ? 'Adding...' : 'Add Product to Store'}</span>
                </button>
            </form>
        </div>
        
        {/* Manual Restock Section */}
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 mb-10">
            <h3 className={`text-2xl font-semibold border-b pb-3 mb-4 text-indigo-600 flex items-center`}>
                <Archive className="mr-2 h-6 w-6" /> Manage Inventory / Restock
            </h3>
            <div className="space-y-4">
                {products.length === 0 ? (
                    <p className="text-gray-500 italic text-center py-5">No products found. Add a product above to manage its stock.</p>
                ) : (
                    products.map(product => (
                        <div key={product.id} className="p-4 border rounded-xl shadow-sm bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div className="mb-3 sm:mb-0">
                                <p className="font-bold text-lg text-gray-800">{product.name}</p>
                                <span className={`px-3 py-0.5 rounded-full text-xs font-semibold self-start ${product.stock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    Current Stock: {product.stock}
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input type="number" placeholder="New Stock Total" value={stockInputs[product.id] || ''} onChange={(e) => handleStockInputChange(product.id, e.target.value)} className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" min="0" step="1" />
                                <button onClick={() => handleUpdateStock(product.id)} disabled={!stockInputs[product.id]} className={`px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    Update
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Orders List */}
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <h3 className={`text-2xl font-semibold border-b pb-3 mb-4 text-indigo-600 flex items-center`}>
                <LayoutList className="mr-2 h-6 w-6" /> Recent Orders
            </h3>
            <div className="space-y-4">
                {orders.length === 0 ? (
                    <p className="text-gray-500 italic text-center py-5">No orders have been placed yet.</p>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="p-4 border rounded-xl shadow-sm bg-gray-50">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-lg text-gray-800 break-all">{order.orderId}</span>
                                <div className="flex items-center space-x-2">
                                    <span className="text-2xl font-extrabold text-green-600">{CURRENCY_SYMBOL}{order.total.toFixed(2)}</span>
                                    <select value={order.status} onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)} className={`px-3 py-1 rounded-full text-sm font-semibold border ${order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : order.status === 'PAID' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-800 border-gray-300'}`}>
                                        {orderStatuses.map(status => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p className="text-sm text-gray-700">Customer: {order.customerDetails.name} ({order.customerDetails.phone})</p>
                            <p className="text-xs text-gray-500">Location: {order.customerDetails.location}</p>
                            <ul className="mt-2 text-sm space-y-1">
                                {order.items.map((item, index) => (
                                    <li key={index} className="flex justify-between border-t pt-1 mt-1">
                                        <span className="text-gray-600">{item.name} x {item.quantity}</span>
                                        <span className="font-medium">{CURRENCY_SYMBOL}{(item.price * item.quantity).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
  );

  const renderProductCatalog = (products, handleAddToCart) => (
    <>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Explore Our Catalogue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20"> 
            {products.length > 0 ? products.map(product => {
                const isAvailable = product.stock > 0;
                
                return (
                    <div key={product.id} className="bg-white p-4 rounded-2xl shadow-xl transition transform hover:scale-[1.02] duration-300 flex flex-col justify-between border border-gray-100">
                        <img src={product.imageUrl || `https://placehold.co/400x300/e0e7ff/1c1c1c?text=${encodeURIComponent(product.name.replace(/ /g, '+'))}`} alt={product.name} className="w-full h-40 object-cover rounded-lg mb-3 shadow-inner" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x300/60a5fa/ffffff?text=Product+Image`; }} />
                        <div className="flex flex-col flex-grow">
                            <h3 className="text-xl font-bold text-gray-800 mb-1 leading-tight">{product.name}</h3>
                            <p className="text-sm text-gray-500 mb-3">{product.description || 'A high-quality item.'}</p>
                            <span className={`px-3 py-0.5 rounded-full text-xs font-semibold self-start mb-3 ${isAvailable ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                                {isAvailable ? `Available (Stock: ${product.stock})` : 'Sold Out'}
                            </span>
                            <p className={`text-3xl font-extrabold text-indigo-600 mb-4 mt-auto`}>
                                {CURRENCY_SYMBOL}{(product.price || 0).toFixed(2)}
                            </p>
                        </div>
                        <button onClick={() => handleAddToCart(product)} disabled={!isAvailable} className={`flex items-center justify-center space-x-2 text-white font-semibold py-2.5 px-4 rounded-xl transition duration-200 ${ isAvailable ? `bg-indigo-500 hover:bg-indigo-600 shadow-md shadow-indigo-200` : 'bg-gray-400 cursor-not-allowed opacity-70' }`}>
                            <ShoppingCart size={18} />
                            <span>{isAvailable ? 'Add to Cart' : 'Sold Out'}</span>
                        </button>
                    </div>
                );
            }) : (
                <div className='col-span-full p-6 bg-yellow-100 rounded-xl text-yellow-800 border-l-4 border-yellow-500 shadow-inner'>
                    <p className="font-semibold mb-2">No products found!</p>
                    {error ? (
                        <p className="text-sm font-bold text-red-700">Error: {error}. Please check your Firebase settings and rules.</p>
                    ) : IS_ADMIN ? (
                      <p className="text-sm">As the Admin, use the form in the 'Admin' panel to add your first product.</p>
                    ) : (
                      <p className="text-sm">The store owner is adding new products. Please check back soon!</p>
                    )}
                </div>
            )}
        </div>
    </>
  );

  const renderCartView = (cartItems, handleUpdateQuantity, cartTotal, setView) => (
    <div className="max-w-xl mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-2xl border border-gray-100">
            <h2 className={`text-3xl font-extrabold text-indigo-700 mb-6 flex items-center`}>
                <ShoppingCart className="mr-3 h-7 w-7" /> Your Cart
            </h2>
            {cartItems.length === 0 ? (
                <p className="text-gray-500 italic text-center py-10 bg-gray-50 rounded-lg">Your cart is empty. Time to shop!</p>
            ) : (
                <>
                    <div className="space-y-1 mb-6 border border-gray-200 rounded-xl overflow-hidden">
                        {cartItems.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-4 border-b border-gray-100 bg-white hover:bg-gray-50 transition duration-150">
                                <div className="flex-grow">
                                    <p className="font-semibold text-gray-800">{item.name}</p>
                                    {/* --- (CRITICAL FIX) --- */}
                                    {/* The error was here. It was `</T</p>` */}
                                    <p className={`text-sm text-indigo-600 font-bold`}>{CURRENCY_SYMBOL}{item.price.toFixed(2)}</p>
                                    {/* --- (END OF CRITICAL FIX) --- */}
                                </div>
                                <div className="flex items-center space-x-2 border border-gray-200 rounded-full p-0.5">
                                    <button onClick={() => handleUpdateQuantity(item.id, -1)} className="bg-gray-100 hover:bg-gray-300 w-7 h-7 rounded-full text-base transition duration-150 text-gray-700"> − </button>
                                    <span className="font-bold w-6 text-center text-gray-800">{item.quantity}</span>
                                    <button onClick={() => handleUpdateQuantity(item.id, 1)} className={`bg-indigo-500 hover:bg-indigo-600 w-7 h-7 rounded-full text-white text-base transition duration-150`}> + </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center border-t-2 pt-4">
                        <span className="text-xl font-bold text-gray-800">TOTAL:</span>
                        <span className={`text-4xl font-extrabold text-indigo-600`}>{CURRENCY_SYMBOL}{cartTotal.toFixed(2)}</span>
                    </div>
                    <button onClick={() => setView('FORM')} className={`w-full mt-6 flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-lg transition duration-200 shadow-lg shadow-indigo-200`}>
                        <CheckCircle size={20} />
                        <span>Proceed to Checkout</span>
                    </button>
                </>
            )}
        </div>
        <button onClick={() => setView('PRODUCTS')} className={`w-full mt-4 text-indigo-600 hover:underline font-medium`}>← Continue Shopping</button>
    </div>
  );

  const renderOrderForm = (formData, setFormData, handlePlaceOrder, cartTotal, orderId, setOrderId, loading) => (
    <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-lg mx-auto border border-gray-100">
        <h2 className={`text-3xl font-extrabold text-indigo-700 mb-6 flex items-center`}>
            <Send className="mr-3 h-7 w-7" /> Finalize Order
        </h2>
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center">
                <span className="text-xl font-semibold text-gray-700">Order Total:</span>
                <span className={`text-4xl font-extrabold text-indigo-600`}>{CURRENCY_SYMBOL}{cartTotal.toFixed(2)}</span>
            </div>
        </div>
        <form onSubmit={handlePlaceOrder} className="space-y-5">
            <h3 className={`text-xl font-semibold border-b pb-2 mb-4 text-indigo-600`}>1. Your Details</h3>
            <div className="space-y-4">
                {[ { name: 'name', type: 'text', placeholder: 'Full Name', icon: User }, { name: 'phone', type: 'tel', placeholder: 'Phone Number (e.g., 080...)', icon: Phone }, { name: 'location', type: 'text', placeholder: 'Delivery Location/Address', icon: MapPin }, ].map(({ name, type, placeholder, icon: Icon }) => (
                    <div key={name} className="relative">
                        <Icon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input type={type} placeholder={placeholder} name={name} value={formData[name]} onChange={(e) => setFormData(prev => ({ ...prev, [name]: e.target.value }))} className={`w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-150`} required />
                    </div>
                ))}
                <textarea placeholder="Specific Order Notes (Optional)" value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" rows="2"></textarea>
            </div>
            <div className={`p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-center shadow-inner`}>
                <p className="font-bold text-lg text-gray-700 mb-2">
                    2. Use this <span className='underline'>Unique Order ID</span> for your payment reference:
                </p>
                <p className={`text-3xl font-extrabold text-indigo-900 p-3 bg-white rounded-lg select-all border-2 border-indigo-300`}>
                    {orderId || 'Generating...'}
                </p>
                <p className='mt-3 text-sm text-gray-600'>This ID links your payment to your digital order.</p>
            </div>
            
            <div className="p-4 bg-gray-100 rounded-xl border border-gray-200">
                <h3 className="text-xl font-semibold mb-3 flex items-center text-gray-700"><Banknote className="mr-2" /> Payment Account Details</h3>
                <div className="text-sm space-y-1">
                    <p><strong>Bank Name:</strong> opay</p>
                    <p><strong>Account Name:</strong> {BUSINESS_NAME}</p>
                    <p><strong>Account Number:</strong> 9041594111 (Copy & Paste)</p>
                </div>
            </div>

            <button type="submit" disabled={loading || cartItems.length === 0} className="w-full flex items-center justify-center space-x-3 bg-green-500 hover:bg-green-600 text-white font-extrabold py-3 rounded-xl text-xl transition duration-200 shadow-xl shadow-green-300 disabled:opacity-50" onClick={() => setOrderId(orderId || generateOrderId())}>
                {loading ? ( <> <Loader className="animate-spin h-6 w-6" /> <span>Placing Order...</span> </> ) : ( <> <Send size={24} /> <span>Place Order & Send on WhatsApp ({CURRENCY_SYMBOL}{cartTotal.toFixed(2)})</span> </> )}
            </button>
        </form>
    </div>
  );

  // --- Main Render Logic ---
  let content;
  if (view === 'PRODUCTS') {
      content = renderProductCatalog(products, handleAddToCart);
  } else if (view === 'CART') {
      content = renderCartView(cartItems, handleUpdateQuantity, cartTotal, setView);
  } else if (view === 'FORM') {
      useEffect(() => {
          if (!orderId) setOrderId(generateOrderId());
      }, [orderId]);
      content = renderOrderForm(formData, setFormData, handlePlaceOrder, cartTotal, orderId, setOrderId, loading);
  } else if (view === 'ADMIN') {
      if (!IS_ADMIN) {
        setView('PRODUCTS');
        content = renderProductCatalog(products, handleAddToCart);
      } else {
        content = renderAdminPanel();
      }
  } else {
      content = <p className="text-center py-10 text-gray-500">View not found.</p>
  }

  if (loading) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
            <Loader className={`animate-spin h-10 w-10 text-indigo-600 mb-4`} />
            <p className="text-xl font-medium text-gray-700">Connecting to {BUSINESS_NAME} Store...</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-4 sm:p-8">
      
      <Modal isOpen={!!error && !loading} title="System Error" onClose={() => setError(null)}>
          <p className="text-red-600 mb-4">A critical error occurred: <b>{error}</b></p>
          <p className="text-sm text-gray-600">This usually means the Firebase configuration is missing or incorrect. Please check your Netlify Environment Variables and Firebase Rules.</p>
          <button onClick={() => setError(null)} className="mt-4 w-full bg-red-500 text-white py-2 rounded-lg">Close</button>
      </Modal>

      <Modal isOpen={!!modalContent} title={modalContent?.title || 'Notification'} onClose={modalContent?.onClose || (() => setModalContent(null))} action={modalContent?.action} actionText={modalContent?.actionText}>
          <p className="text-gray-700 mb-4">{modalContent?.message}</p>
      </Modal>
      
      {renderLoginModal()}

      <header className="flex justify-between items-center py-4 px-2 mb-8 bg-white shadow-md rounded-xl sticky top-0 z-10">
        <h1 className={`text-2xl sm:text-3xl font-extrabold text-indigo-700 flex items-center transition duration-150`}>
          <Package className="mr-2 h-7 w-7" />
          {BUSINESS_NAME}
        </h1>
        <div className="flex items-center space-x-2 sm:space-x-4">
          
          {IS_ADMIN && (
              <button onClick={() => setView('ADMIN')} className={`px-3 py-2 rounded-xl font-semibold transition duration-150 text-sm sm:text-base ${view === 'ADMIN' ? 'bg-red-600 text-white shadow-lg' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                <Shield size={20} className="inline mr-1" /> Admin
              </button>
          )}

          <button onClick={() => setView('PRODUCTS')} className={`px-3 py-2 rounded-xl font-semibold transition duration-150 text-sm sm:text-base ${view === 'PRODUCTS' ? `bg-indigo-600 text-white shadow-lg` : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            <List size={20} className="inline sm:mr-1" /> <span className="hidden sm:inline">Goods</span>
          </button>
          <button onClick={() => setView('CART')} className={`relative px-3 py-2 rounded-xl font-semibold transition duration-150 text-sm sm:text-base ${view === 'CART' || view === 'FORM' ? `bg-indigo-600 text-white shadow-lg` : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            <ShoppingCart size={20} className="inline" />
            {cartItems.length > 0 && (
              <span className={`absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white`}>
                {cartItems.length}
              </span>
            )}
          </button>
          
          {IS_ADMIN ? (
             <button onClick={handleLogout} className={`px-3 py-2 rounded-xl font-semibold transition duration-150 text-sm sm:text-base bg-gray-100 text-gray-700 hover:bg-gray-200`} title="Logout">
                <LogOut size={20} className="inline" />
              </button>
          ) : (
              <button onClick={() => setShowLogin(true)} className={`px-3 py-2 rounded-xl font-semibold transition duration-150 text-sm sm:text-base bg-green-100 text-green-700 hover:bg-green-200`} title="Admin Login">
                <LogIn size={20} className="inline" />
              </button>
          )}
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto">
        {content}
      </main>
    </div>
  );
};

export default App;


