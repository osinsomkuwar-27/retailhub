import { useParams } from 'react-router-dom';
import ProductForm from '../../components/inventory/ProductForm';

export default function EditProduct() {
  const { id } = useParams();
  return <ProductForm key={id} id={id} />;
}
