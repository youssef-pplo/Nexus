import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, increment, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowUpCircle, ArrowDownCircle, Plus, MessageSquare, Lightbulb, FolderKanban, ArrowLeft } from 'lucide-react';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
    const [page, setPage] = useState('projects');
    const [posts, setPosts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [selectedPostId, setSelectedPostId] = useState(null);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
            setAuth(authInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Authentication error:", error);
                    }
                }
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
        }
    }, []);

    useEffect(() => {
        if (db && userId) {
            setLoading(true);
            const postsCollectionPath = `/artifacts/${appId}/public/data/posts`;
            const q = query(collection(db, postsCollectionPath), where("type", "==", page));

            const unsubscribe = onSnapshot(q, async (querySnapshot) => {
                const postsDataPromises = querySnapshot.docs.map(async (docSnapshot) => {
                    const post = { id: docSnapshot.id, ...docSnapshot.data() };
                    const voteRef = doc(db, postsCollectionPath, post.id, 'userVotes', userId);
                    const voteSnap = await getDoc(voteRef);
                    post.userVote = voteSnap.exists() ? voteSnap.data().value : 0;
                    return post;
                });

                const postsData = await Promise.all(postsDataPromises);
                postsData.sort((a, b) => (b.votes || 0) - (a.votes || 0));
                setPosts(postsData);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching posts:", error);
                setLoading(false);
            });

            return () => unsubscribe();
        }
    }, [db, page, userId, appId]);

    const handleSetPage = (newPage) => {
        setPage(newPage);
        setSelectedPostId(null); 
    };

    const handleAddNewPost = async (post) => {
        if (!db) return;
        try {
            await addDoc(collection(db, `/artifacts/${appId}/public/data/posts`), {
                ...post,
                votes: 0,
                createdAt: serverTimestamp(),
                authorId: userId,
                commentCount: 0,
            });
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error adding document: ", error);
        }
    };

    const handleVote = async (itemId, collectionPath, newVoteValue) => {
        if (!db || !userId) return;

        const itemRef = doc(db, collectionPath, itemId);
        const voteRef = doc(db, collectionPath, itemId, 'userVotes', userId);

        try {
            const voteDoc = await getDoc(voteRef);
            const currentVote = voteDoc.exists() ? voteDoc.data().value : 0;
            let voteIncrement = 0;

            if (newVoteValue === currentVote) { 
                await deleteDoc(voteRef);
                voteIncrement = -newVoteValue;
            } else { 
                await setDoc(voteRef, { value: newVoteValue });
                voteIncrement = newVoteValue - currentVote;
            }

            if(voteIncrement !== 0) {
                await updateDoc(itemRef, { votes: increment(voteIncrement) });
            }
        } catch (error) {
            console.error("Error voting:", error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans bg-grid-cyan-500/[0.2] relative">
            <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-gray-900 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>

            <Header setPage={handleSetPage} currentPage={page} onAddNew={() => setIsModalOpen(true)} />

            <main className="container mx-auto px-4 py-8 relative z-10">
                <PageContent 
                    page={page} 
                    posts={posts} 
                    loading={loading}
                    onVote={(id, vote) => handleVote(id, `/artifacts/${appId}/public/data/posts`, vote)}
                    selectedPostId={selectedPostId}
                    setSelectedPostId={setSelectedPostId}
                    userId={userId}
                    db={db}
                />
            </main>

            {isModalOpen && (
                <AddNewModal 
                    onClose={() => setIsModalOpen(false)} 
                    onSubmit={handleAddNewPost}
                />
            )}
        </div>
    );
}

function Header({ setPage, currentPage, onAddNew }) {
    const navItems = [
        { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-5 h-5 mr-2" /> },
        { id: 'ideas', label: 'Ideas', icon: <Lightbulb className="w-5 h-5 mr-2" /> },
        { id: 'discussions', label: 'Discussions', icon: <MessageSquare className="w-5 h-5 mr-2" /> },
    ];

    return (
        <header className="sticky top-0 z-20 bg-gray-900/50 backdrop-blur-lg border-b border-cyan-500/20">
            <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                       <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wider">Nexus</h1>
                </div>
                <div className="hidden md:flex items-center space-x-4">
                    {navItems.map(item => (
                        <button key={item.id} onClick={() => setPage(item.id)}
                            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ease-in-out ${currentPage === item.id ? 'bg-cyan-500 text-gray-900 shadow-md shadow-cyan-500/40' : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'}`}>
                            {item.icon} {item.label}
                        </button>
                    ))}
                </div>
                <button onClick={onAddNew} className="flex items-center bg-fuchsia-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-fuchsia-500 transition-all duration-300 ease-in-out shadow-lg shadow-fuchsia-600/40 transform hover:scale-105">
                    <Plus className="w-5 h-5 mr-2" /> Add New
                </button>
            </nav>
        </header>
    );
}

function PageContent({ page, posts, loading, onVote, selectedPostId, setSelectedPostId, userId, db }) {
    if (loading) return <LoadingSpinner />;
    if (posts.length === 0 && !selectedPostId) return <EmptyState type={page} />;

    if (page === 'discussions') {
        if (selectedPostId) {
            return <DiscussionDetailView postId={selectedPostId} onBack={() => setSelectedPostId(null)} userId={userId} db={db} />;
        }
        return (
            <div className="space-y-6">
                {posts.map(post => <DiscussionCard key={post.id} post={post} onVote={onVote} onSelect={() => setSelectedPostId(post.id)} />)}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map(post => <PostCard key={post.id} post={post} onVote={onVote} />)}
        </div>
    );
}

const VoteButtons = ({ onVote, userVote, votes }) => (
    <div className="flex items-center space-x-4">
        <button onClick={() => onVote(1)} className={`transition-colors transform hover:scale-110 ${userVote === 1 ? 'text-green-400' : 'text-gray-500 hover:text-green-400'}`}>
            <ArrowUpCircle size={28} />
        </button>
        <span className="text-xl font-bold text-cyan-400 w-8 text-center">{votes || 0}</span>
        <button onClick={() => onVote(-1)} className={`transition-colors transform hover:scale-110 ${userVote === -1 ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}>
            <ArrowDownCircle size={28} />
        </button>
    </div>
);

function PostCard({ post, onVote }) {
    return (
        <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-lg overflow-hidden transition-all duration-300 hover:border-cyan-500 hover:shadow-2xl hover:shadow-cyan-500/20 transform hover:-translate-y-1 flex flex-col">
            {post.imageUrl && <img src={post.imageUrl} alt={post.title} className="w-full h-48 object-cover" onError={(e) => { e.target.onerror = null; e.target.src=`https:
            <div className="p-5 flex flex-col flex-grow">
                <div className="flex-grow">
                    <h3 className="text-xl font-bold text-white mb-2">{post.title}</h3>
                    <p className="text-gray-400 text-sm mb-4">{post.text}</p>
                </div>
                <div className="flex justify-between items-center mt-auto pt-4">
                    <VoteButtons onVote={(v) => onVote(post.id, v)} userVote={post.userVote} votes={post.votes} />
                    {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" className="text-sm bg-cyan-600/50 text-cyan-200 px-3 py-1 rounded-full hover:bg-cyan-500/70 transition-colors">View Project</a>}
                </div>
            </div>
        </div>
    );
}

function DiscussionCard({ post, onVote, onSelect }) {
    return (
        <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-lg p-5 transition-all duration-300 hover:border-fuchsia-500 hover:shadow-2xl hover:shadow-fuchsia-500/20 flex items-center space-x-6">
            <VoteButtons onVote={(v) => onVote(post.id, v)} userVote={post.userVote} votes={post.votes} />
            <div className="flex-grow cursor-pointer" onClick={onSelect}>
                <h3 className="text-xl font-bold text-white mb-1">{post.title}</h3>
                <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <span>{post.commentCount || 0} comments</span>
                    <span>Posted {post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'recently'}</span>
                </div>
            </div>
        </div>
    );
}

function DiscussionDetailView({ postId, onBack, userId, db }) {
    const [post, setPost] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');

    const postCollectionPath = `/artifacts/${appId}/public/data/posts`;
    const commentsCollectionPath = `${postCollectionPath}/${postId}/comments`;

    useEffect(() => {
        if (!db || !userId) return;
        setLoading(true);
        const postRef = doc(db, postCollectionPath, postId);
        const unsubscribePost = onSnapshot(postRef, async (docSnap) => {
            if (docSnap.exists()) {
                const postData = { id: docSnap.id, ...docSnap.data() };
                const voteRef = doc(db, postCollectionPath, postData.id, 'userVotes', userId);
                const voteSnap = await getDoc(voteRef);
                postData.userVote = voteSnap.exists() ? voteSnap.data().value : 0;
                setPost(postData);
            }
            setLoading(false);
        });

        const commentsQuery = query(collection(db, commentsCollectionPath));
        const unsubscribeComments = onSnapshot(commentsQuery, async (snapshot) => {
            const commentsPromises = snapshot.docs.map(async (docSnapshot) => {
                const comment = { id: docSnapshot.id, ...docSnapshot.data() };
                const voteRef = doc(db, commentsCollectionPath, comment.id, 'userVotes', userId);
                const voteSnap = await getDoc(voteRef);
                comment.userVote = voteSnap.exists() ? voteSnap.data().value : 0;
                return comment;
            });
            const commentsData = await Promise.all(commentsPromises);
            commentsData.sort((a, b) => (b.votes || 0) - (a.votes || 0));
            setComments(commentsData);
        });

        return () => {
            unsubscribePost();
            unsubscribeComments();
        };
    }, [db, postId, userId]);

    const handleVote = async (itemId, collectionPath, newVoteValue) => {
        if (!db || !userId) return;
        const itemRef = doc(db, collectionPath, itemId);
        const voteRef = doc(db, collectionPath, itemId, 'userVotes', userId);
        const voteDoc = await getDoc(voteRef);
        const currentVote = voteDoc.exists() ? voteDoc.data().value : 0;
        let voteIncrement = newVoteValue === currentVote ? -newVoteValue : newVoteValue - currentVote;
        if (newVoteValue === currentVote) await deleteDoc(voteRef);
        else await setDoc(voteRef, { value: newVoteValue });
        if(voteIncrement !== 0) await updateDoc(itemRef, { votes: increment(voteIncrement) });
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !db) return;
        await addDoc(collection(db, commentsCollectionPath), {
            text: newComment,
            authorId: userId,
            createdAt: serverTimestamp(),
            votes: 0,
        });
        await updateDoc(doc(db, postCollectionPath, postId), { commentCount: increment(1) });
        setNewComment('');
    };

    if (loading) return <LoadingSpinner />;
    if (!post) return <p>Discussion not found.</p>;

    return (
        <div className="max-w-4xl mx-auto">
            <button onClick={onBack} className="flex items-center text-cyan-400 hover:text-cyan-300 mb-6">
                <ArrowLeft className="mr-2" /> Back to Discussions
            </button>
            <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                <h2 className="text-3xl font-bold text-white">{post.title}</h2>
                <p className="text-gray-300 mt-4">{post.text}</p>
                <div className="mt-4">
                    <VoteButtons onVote={(v) => handleVote(post.id, postCollectionPath, v)} userVote={post.userVote} votes={post.votes} />
                </div>
            </div>

            <div className="mt-8">
                <h3 className="text-2xl font-semibold text-white mb-4">Comments ({comments.length})</h3>
                <form onSubmit={handleAddComment} className="mb-6">
                    <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white leading-tight focus:outline-none focus:ring-2 focus:ring-fuchsia-500 h-24"
                        placeholder="Add your comment..."></textarea>
                    <button type="submit" className="mt-2 bg-fuchsia-600 text-white font-bold py-2 px-4 rounded hover:bg-fuchsia-500 transition-colors shadow-lg shadow-fuchsia-600/40">Post Comment</button>
                </form>
                <div className="space-y-4">
                    {comments.map(comment => (
                        <div key={comment.id} className="bg-gray-800/30 p-4 rounded-lg border border-gray-700/50 flex space-x-4">
                            <VoteButtons onVote={(v) => handleVote(comment.id, commentsCollectionPath, v)} userVote={comment.userVote} votes={comment.votes} />
                            <p className="text-gray-300 flex-grow">{comment.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AddNewModal({ onClose, onSubmit }) {
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [link, setLink] = useState('');
    const [type, setType] = useState('projects');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title || !text) return;
        let postData = { title, text, type };
        if (type === 'projects') {
            postData.imageUrl = imageUrl || `https:
            postData.link = link;
        }
        onSubmit(postData);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-fuchsia-500/50 rounded-lg shadow-2xl shadow-fuchsia-500/20 w-full max-w-lg p-8 m-4">
                <h2 className="text-2xl font-bold text-white mb-6">Add a new submission</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-cyan-400 text-sm font-bold mb-2" htmlFor="type">Type</label>
                        <select id="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white leading-tight focus:outline-none focus:ring-2 focus:ring-fuchsia-500">
                            <option value="projects">Project</option>
                            <option value="ideas">Idea</option>
                            <option value="discussions">Discussion</option>
                        </select>
                    </div>
                    <div className="mb-4">
                        <label className="block text-cyan-400 text-sm font-bold mb-2" htmlFor="title">Title</label>
                        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white leading-tight focus:outline-none focus:ring-2 focus:ring-fuchsia-500" required />
                    </div>
                    <div className="mb-4">
                        <label className="block text-cyan-400 text-sm font-bold mb-2" htmlFor="text">Description / Post</label>
                        <textarea id="text" value={text} onChange={(e) => setText(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white leading-tight focus:outline-none focus:ring-2 focus:ring-fuchsia-500 h-24" required></textarea>
                    </div>
                    {type === 'projects' && (
                        <>
                            <div className="mb-4"><label className="block text-cyan-400 text-sm font-bold mb-2" htmlFor="imageUrl">Image URL</label><input id="imageUrl" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white" /></div>
                            <div className="mb-6"><label className="block text-cyan-400 text-sm font-bold mb-2" htmlFor="link">Project Link</label><input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded py-2 px-3 text-white" /></div>
                        </>
                    )}
                    <div className="flex items-center justify-end space-x-4">
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-white transition-colors">Cancel</button>
                        <button type="submit" className="bg-fuchsia-600 text-white font-bold py-2 px-4 rounded hover:bg-fuchsia-500 transition-colors shadow-lg shadow-fuchsia-600/40">Submit</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
    );
}

function EmptyState({ type }) {
    return (
        <div className="text-center py-20 px-6 bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-2">It's quiet in here...</h3>
            <p className="text-gray-400">No {type} have been submitted yet. Be the first to share!</p>
        </div>
    );
}
