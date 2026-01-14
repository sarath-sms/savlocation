import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  Modal,
  Animated,
  StyleSheet,
  Platform,
  Linking,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export default function ContactSaver() {
  const [contacts, setContacts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    mobile: '',
    email: '',
    address: '',
    description: '',
    imageUri: ''
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(300));

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (modalVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(300);
    }
  }, [modalVisible]);

  const loadContacts = async () => {
    try {
      const stored = await AsyncStorage.getItem('contacts');
      if (stored) {
        setContacts(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const saveContacts = async (newContacts) => {
    try {
      await AsyncStorage.setItem('contacts', JSON.stringify(newContacts));
      setContacts(newContacts);
    } catch (error) {
      console.error('Error saving contacts:', error);
    }
  };

  const handleGetCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable location permission');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      setFormData({ ...formData, location: mapUrl });
      Alert.alert('Success', 'Location captured!');
    } catch (error) {
      Alert.alert('Error', 'Could not get location. Please paste a map URL instead.');
    }
  };

  const handleTakePicture = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable camera permission');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
      });

      if (!result.canceled) {
        setFormData({ ...formData, imageUri: result.assets[0].uri });
        Alert.alert('Success', 'Photo captured!');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not take picture');
    }
  };

  const handleSave = () => {
    if (!formData.name.trim() || !formData.location.trim()) {
      Alert.alert('Required Fields', 'Name and Location are required!');
      return;
    }

    const newContact = {
      id: editingId || Date.now().toString(),
      ...formData,
      createdAt: editingId ? contacts.find(c => c.id === editingId)?.createdAt : new Date().toISOString()
    };

    let updatedContacts;
    if (editingId) {
      updatedContacts = contacts.map(c => c.id === editingId ? newContact : c);
    } else {
      updatedContacts = [...contacts, newContact];
    }

    saveContacts(updatedContacts);
    closeModal();
    Alert.alert('Success', editingId ? 'Contact updated!' : 'Contact saved!');
  };

  const handleEdit = (contact) => {
    setFormData(contact);
    setEditingId(contact.id);
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Alert.alert(
      'Delete Contact',
      'Are you sure you want to delete this contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updated = contacts.filter(c => c.id !== id);
            saveContacts(updated);
          }
        }
      ]
    );
  };

  const openModal = () => {
    setFormData({
      name: '',
      location: '',
      mobile: '',
      email: '',
      address: '',
      description: '',
      imageUri: ''
    });
    setEditingId(null);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setFormData({
      name: '',
      location: '',
      mobile: '',
      email: '',
      address: '',
      description: ''
    });
    setEditingId(null);
  };

  const generateCSV = () => {
    if (contacts.length === 0) {
      return null;
    }

    const headers = 'Name,Location,Mobile,Email,Address,Description\n';
    const rows = contacts.map(c => 
      `"${c.name}","${c.location}","${c.mobile || ''}","${c.email || ''}","${c.address || ''}","${c.description || ''}"`
    ).join('\n');
    
    return headers + rows;
  };

  const handleDownloadCSV = async () => {
    try {
      if (contacts.length === 0) {
        Alert.alert('No Data', 'No contacts to export!');
        return;
      }

      const csv = generateCSV();
      const fileName = `contacts_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Contacts CSV'
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to export CSV: ' + error.message);
    }
  };

  const handleImportCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const csvContent = await FileSystem.readAsStringAsync(fileUri);
      
      const lines = csvContent.split('\n').slice(1);
      const importedContacts = lines
        .filter(line => line.trim())
        .map(line => {
          const regex = /("([^"]*)"|([^,]*))/g;
          const values = [];
          let match;
          while ((match = regex.exec(line)) !== null) {
            values.push(match[2] || match[3] || '');
          }
          
          return {
            id: Date.now().toString() + Math.random(),
            name: values[0] || '',
            location: values[1] || '',
            mobile: values[2] || '',
            email: values[3] || '',
            address: values[4] || '',
            description: values[5] || '',
            imageUri: '',
            createdAt: new Date().toISOString()
          };
        })
        .filter(contact => contact.name && contact.location);

      if (importedContacts.length === 0) {
        Alert.alert('Error', 'No valid contacts found in CSV');
        return;
      }

      const updatedContacts = [...contacts, ...importedContacts];
      saveContacts(updatedContacts);
      Alert.alert('Success', `Imported ${importedContacts.length} contact(s)!`);
    } catch (error) {
      Alert.alert('Error', 'Failed to import CSV: ' + error.message);
    }
  };

  const handleShareWhatsApp = () => {
    if (contacts.length === 0) {
      Alert.alert('No Data', 'No contacts to share!');
      return;
    }

    const message = `📇 *My Contacts*\n\n${contacts.map((c, i) => 
      `${i + 1}. *${c.name}*\n📍 ${c.location}\n${c.mobile ? `📱 ${c.mobile}\n` : ''}${c.email ? `📧 ${c.email}\n` : ''}`
    ).join('\n')}`;

    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(whatsappUrl).then((supported) => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed');
      }
    });
  };

  const handleShareSingleContact = async (contact) => {
    let message = `📇 *${contact.name}*\n\n📍 Location: ${contact.location}`;
    
    if (contact.mobile) message += `\n📱 Mobile: ${contact.mobile}`;
    if (contact.email) message += `\n📧 Email: ${contact.email}`;
    if (contact.address) message += `\n🏠 Address: ${contact.address}`;
    if (contact.description) message += `\n\n📝 ${contact.description}`;

    // Always share text via WhatsApp
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        
        // If there's an image, share it separately after text
        if (contact.imageUri) {
          setTimeout(async () => {
            try {
              await Sharing.shareAsync(contact.imageUri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share Contact Photo'
              });
            } catch (err) {
              console.log('Could not share image');
            }
          }, 1000);
        }
      } else {
        Alert.alert('Error', 'WhatsApp is not installed');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not share contact');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>𞄹 SavLocation</Text>
        <Text style={styles.headerSubtitle}>
          {!!contacts.length && `Total Locations: ${contacts.length}`}
        </Text>
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity onPress={handleImportCSV} style={[styles.actionButton, { backgroundColor: '#8ab5f9' }]}>
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>📤 Import CSV</Text>
          </TouchableOpacity>
  
          <TouchableOpacity
            onPress={handleShareWhatsApp}
            disabled={contacts.length === 0}
            style={[styles.actionButton, { backgroundColor: contacts.length === 0 ? '#666' : '#25D366' }]}
          >
            <Text style={[styles.actionButtonText, { color: '#fff' }]}>💬 Share All</Text>
          </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDownloadCSV}
          disabled={contacts.length === 0}
          style={[styles.actionButton, { backgroundColor: contacts.length === 0 ? '#666' : '#FFEB3B' }]}
        >
          <Text style={styles.actionButtonText}>📥 Export CSV</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listContainer}>
        {contacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>No contacts yet!</Text>
            <Text style={styles.emptySubtext}>Tap the + button to add or import CSV</Text>
          </View>
        ) : (
          contacts.map((contact) => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity onPress={() => handleShareSingleContact(contact)} style={styles.iconButton}>
                    <Text style={styles.icon}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEdit(contact)} style={styles.iconButton}>
                    <Text style={styles.icon}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(contact.id)} style={styles.iconButton}>
                    <Text style={styles.icon}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {contact.imageUri && (
                <Image source={{ uri: contact.imageUri }} style={styles.contactImage} />
              )}

              <TouchableOpacity onPress={() => Linking.openURL(contact.location)}>
                <Text style={styles.locationLink}>📍 {contact.location}</Text>
              </TouchableOpacity>

              {contact.mobile && <Text style={styles.contactDetail}>📱 {contact.mobile}</Text>}
              {contact.email && <Text style={styles.contactDetail}>📧 {contact.email}</Text>}
              {contact.address && <Text style={styles.contactDetail}>🏠 {contact.address}</Text>}
              {contact.description && (
                <Text style={styles.contactDescription}>{contact.description}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity onPress={openModal} style={styles.fab}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={closeModal}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal}>
            <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editingId ? 'Edit Contact' : 'New Contact'}
                    </Text>
                    <TouchableOpacity onPress={closeModal}>
                      <Text style={styles.closeButton}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.label}>Name *</Text>
                    <TextInput
                      value={formData.name}
                      onChangeText={(text) => setFormData({ ...formData, name: text })}
                      placeholder="Enter name"
                      placeholderTextColor="#666"
                      style={styles.inputRequired}
                    />

                    <Text style={styles.label}>Location *</Text>
                    <View style={styles.locationRow}>
                      <TextInput
                        value={formData.location}
                        onChangeText={(text) => setFormData({ ...formData, location: text })}
                        placeholder="Paste map URL or tap 📍"
                        placeholderTextColor="#666"
                        style={[styles.inputRequired, { flex: 1 }]}
                      />
                      <TouchableOpacity onPress={handleGetCurrentLocation} style={styles.locationButton}>
                        <Text style={styles.locationButtonText}>📍</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.labelOptional}>Photo (Optional)</Text>
                    <View style={styles.photoSection}>
                      {formData.imageUri ? (
                        <View style={styles.photoPreview}>
                          <Image source={{ uri: formData.imageUri }} style={styles.previewImage} />
                          <TouchableOpacity 
                            onPress={() => setFormData({ ...formData, imageUri: '' })}
                            style={styles.removePhotoButton}
                          >
                            <Text style={styles.removePhotoText}>✕ Remove</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={handleTakePicture} style={styles.cameraButton}>
                          <Text style={styles.cameraButtonText}>📷 Take Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={styles.labelOptional}>Mobile Number</Text>
                    <TextInput
                      value={formData.mobile}
                      onChangeText={(text) => setFormData({ ...formData, mobile: text })}
                      placeholder="Optional"
                      placeholderTextColor="#666"
                      keyboardType="phone-pad"
                      style={styles.input}
                    />

                    <Text style={styles.labelOptional}>Email</Text>
                    <TextInput
                      value={formData.email}
                      onChangeText={(text) => setFormData({ ...formData, email: text })}
                      placeholder="Optional"
                      placeholderTextColor="#666"
                      keyboardType="email-address"
                      style={styles.input}
                    />

                    <Text style={styles.labelOptional}>Address</Text>
                    <TextInput
                      value={formData.address}
                      onChangeText={(text) => setFormData({ ...formData, address: text })}
                      placeholder="Optional"
                      placeholderTextColor="#666"
                      multiline
                      numberOfLines={2}
                      style={[styles.input, { minHeight: 60 }]}
                    />

                    <Text style={styles.labelOptional}>Description</Text>
                    <TextInput
                      value={formData.description}
                      onChangeText={(text) => setFormData({ ...formData, description: text })}
                      placeholder="Optional"
                      placeholderTextColor="#666"
                      multiline
                      numberOfLines={3}
                      style={[styles.input, { minHeight: 80 }]}
                    />

                    <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
                      <Text style={styles.saveButtonText}>
                        {editingId ? 'Update Contact' : 'Save Contact'}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26355D' },
  header: {
    backgroundColor: '#FFEB3B',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
      android: { elevation: 5 }
    })
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#26355D' },
  headerSubtitle: { fontSize: 14, color: '#26355D', marginTop: 5, opacity: 0.8 },
  actionBar: { 
    flexDirection: 'row', 
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionButtonText: { 
    color: '#26355D', 
    fontWeight: '600',
    fontSize: 14
  },
  listContainer: { flex: 1, padding: 15 },
  emptyState: { alignItems: 'center', marginTop: 50, padding: 20 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#FFEB3B', fontSize: 18, marginTop: 15 },
  emptySubtext: { color: '#888', fontSize: 14, marginTop: 5, textAlign: 'center' },
  contactCard: {
    backgroundColor: '#1a2847',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFEB3B'
  },
  contactHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  contactName: { fontSize: 18, fontWeight: 'bold', color: '#FFEB3B' },
  contactActions: { flexDirection: 'row', gap: 10 },
  iconButton: { padding: 5 },
  icon: { fontSize: 20 },
  contactImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10
  },
  locationLink: { color: '#4dabf7', textDecorationLine: 'underline', marginBottom: 8 },
  contactDetail: { color: '#ccc', marginBottom: 5 },
  contactDescription: { color: '#aaa', marginTop: 8, fontStyle: 'italic' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#FFEB3B',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
      android: { elevation: 8 }
    })
  },
  fabText: { fontSize: 30, color: '#26355D', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#26355D',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    maxHeight: '90%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFEB3B' },
  closeButton: { fontSize: 28, color: '#FFEB3B' },
  label: { color: '#FFEB3B', marginBottom: 5, fontWeight: '600' },
  labelOptional: { color: '#ccc', marginBottom: 5 },
  inputRequired: {
    backgroundColor: '#1a2847',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#FFEB3B'
  },
  input: {
    backgroundColor: '#1a2847',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  locationRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  locationButton: {
    backgroundColor: '#FFEB3B',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: 50
  },
  locationButtonText: { fontSize: 24 },
  photoSection: { marginBottom: 15 },
  photoPreview: { alignItems: 'center' },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10
  },
  removePhotoButton: {
    backgroundColor: '#ff6b6b',
    padding: 10,
    borderRadius: 8
  },
  removePhotoText: { color: '#fff', fontWeight: '600' },
  cameraButton: {
    backgroundColor: '#FFEB3B',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  cameraButtonText: { color: '#26355D', fontWeight: '600', fontSize: 16 },
  saveButton: {
    backgroundColor: '#FFEB3B',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20
  },
  saveButtonText: { color: '#26355D', fontSize: 16, fontWeight: 'bold' }
});