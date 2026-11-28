# परिनियोजन

वर्तमान सेवा चुनी गई मौजूदा PostgreSQL स्थापना और OpenFGA endpoint खोलती है। विफलता पर प्रतिस्थापन डेटाबेस नहीं बनता। शामिल सेवाएँ और प्रबंधित स्थानीय जीवनचक्र अभी लागू हो रहे हैं; यह कनेक्शन वायरिंग पूरी परिनियोजन योजना नहीं है।

Deployment शुरू करने से पहले चुना गया नया PostgreSQL डेटाबेस और OpenFGA तैयार करें; फिर `IRONLOOM_DATABASE_URL` तथा `IRONLOOM_INSTALLER_TOKEN` के साथ एक बार `ironloom initialize` चलाएँ। यह केवल नया Ironloom स्कीमा बनाता है और मौजूदा स्कीमा अस्वीकार करता है। सामान्य पुनः आरंभ `ironloom serve` से वही स्थापना खोलता है। प्रारंभिक अनुमति की पुनर्प्राप्ति केवल उसी सहेजे हुए प्रशासक के लिए है; खाता नहीं बदलेगा और पूर्ण होने के बाद हटाई गई अनुमति वापस नहीं मिलेगी।

```mermaid
flowchart LR
  DB[(Fresh PostgreSQL)] --> Init[ironloom initialize]
  Init --> Service[ironloom serve]
  FGA[Configured OpenFGA] --> Service
  Service --> Account[Register and authenticate]
  Account --> Bootstrap[One-time bootstrap]
  Bootstrap --> Ready[Recover same-user initial grants]
```

Chart `database.existingSecret` / `database.urlKey` से `IRONLOOM_DATABASE_URL` लेता है (डिफ़ॉल्ट `ironloom-database` / `database-url`)। `openfga.url` को वास्तविक अधिकृत endpoint पर सेट करें; वैकल्पिक `openfga.existingSecret` / `openfga.tokenKey` उसका टोकन देते हैं। डिफ़ॉल्ट endpoint अभी शामिल OpenFGA सेवा नहीं है; उसे कॉन्फ़िगर करें। कनेक्शन निजी रखें और दूरस्थ परिवहन सुरक्षित करें।

मौजूदा setup secret में base64 में 32 बाइट का `IRONLOOM_CONFIG_KEY` दें। प्रारंभिक टोकन प्रमाणित bootstrap में एक बार खर्च होता है; यह पुनः उपयोग योग्य प्रशासक पासवर्ड नहीं है। खाते auth registration मार्ग से बनते हैं। आधार पथ वाला `runtime.publicUrl` और स्पष्ट धनात्मक `download.maxFileBytes` / `download.maxTransferBytes` सेट करें।

Chart रेंडर करने से परिनियोजन या inference qualification नहीं होती। स्थायी मूल और उनके मालिक अलग रखें। कनेक्शन या प्रमाणीकरण त्रुटि से बचने के लिए PVC न हटाएँ और स्थापना रीसेट न करें।
